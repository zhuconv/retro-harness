from __future__ import annotations

import argparse
import json
from types import SimpleNamespace

import pytest

from rho.method import apply as apply_method
from rho.method import search as search_method
from rho.method.oracle import OracleClient
from rho.protocols import Trajectory


def _trajectory(**overrides) -> Trajectory:
    values = {
        "id": "traj_test",
        "kind": "solve",
        "task_id": "task-a",
        "harness_id": "h_seed",
        "instructions": "solve",
        "events": [{"type": "turn.completed"}],
        "final_message": "done",
        "stdout": "",
        "stderr": "",
        "workspace_diff": {},
        "workspace_deletions": frozenset(),
        "exit_code": 0,
        "wall_time_s": 1.25,
        "timed_out": False,
    }
    values.update(overrides)
    return Trajectory(**values)


def test_apply_uses_harness_in_workspace_and_writes_trajectory(monkeypatch, tmp_path):
    workspace = tmp_path / "workspace"
    harness = tmp_path / "harness"
    logs = tmp_path / "logs"
    workspace.mkdir()
    harness.mkdir()
    (harness / "GUIDE.md").write_text("persistent guidance")
    calls = []

    class FakeAgent:
        def __init__(self, **kwargs):
            calls.append(kwargs)

        def run(self, root, instructions, **kwargs):
            assert (root / ".rho-method" / "harness" / "GUIDE.md").is_file()
            assert "Persistent method context" in instructions
            (root / "solution.txt").write_text("solved")
            return _trajectory()

    monkeypatch.setattr(apply_method, "CodexAgent", FakeAgent)
    monkeypatch.setattr(apply_method, "codex_binary", lambda: "/fake/codex")
    monkeypatch.setenv("OPENAI_BASE_URL", "http://gateway")
    monkeypatch.setenv("OPENAI_API_KEY", "secret")
    args = argparse.Namespace(
        instruction="repair it",
        model="openai/gpt-5.5",
        reasoning_effort="high",
        workspace=str(workspace),
        logs=str(logs),
        harness=str(harness),
    )

    assert apply_method.run(args) == 0
    assert (workspace / "solution.txt").read_text() == "solved"
    assert not (workspace / ".rho-method").exists()
    assert calls[0]["binary"] == "/fake/codex"
    events = [json.loads(line) for line in (logs / "atif" / "trajectory.jsonl").read_text().splitlines()]
    assert events[-1] == {"type": "rho_final_message", "text": "done"}


def test_oracle_reward_is_available_to_grade_but_hidden_from_trajectory(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("ALPHA_SEARCH_ORACLE_URL", "http://oracle/v1/evaluate")
    monkeypatch.setenv("ALPHA_SEARCH_ORACLE_TOKEN", "token")
    monkeypatch.setenv(
        "ALPHA_SEARCH_ORACLE_PROTOCOL", "alpha-eval-search-oracle/v1"
    )
    atif = tmp_path / "trajectory.jsonl"
    atif.write_text('{"type":"agent_message","text":"working"}\n')
    payload = {
        "schema_version": "alpha-eval-search-evaluation-response/v1",
        "evaluation_id": "eval-000001-abc",
        "candidate_sha256": "abc",
        "reward": 0.75,
        "metrics": {"quality": 0.75},
        "trajectory": str(atif),
        "final_message": "finished",
        "returncode": 0,
        "seconds": 2.0,
    }

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return json.dumps(payload).encode()

    monkeypatch.setattr(
        "rho.method.oracle.urllib.request.urlopen", lambda *_args, **_kwargs: Response()
    )
    workspace = tmp_path / "solve"
    (workspace / "harness").mkdir(parents=True)
    client = OracleClient()

    trajectory = client.solve(
        workspace=workspace,
        instructions="solve",
        task_id="task-a",
        harness_id="h_seed",
        model="gpt-5.5",
        reasoning_effort="high",
    )

    assert "0.75" not in json.dumps(trajectory.events)
    assert trajectory.final_message == "finished"
    grade = client.grade(trajectory)
    assert grade.score == 0.75
    assert grade.details["evaluation_id"] == "eval-000001-abc"


@pytest.mark.parametrize(
    ("mode", "expected"), (("rho", "evolution"), ("meta-harness", "meta"))
)
def test_search_dispatches_to_original_retro_runners(
    monkeypatch, tmp_path, mode, expected
):
    seed = tmp_path / "seed"
    seed.mkdir()
    (seed / "README.md").write_text("seed")
    request = {
        "request_id": "search-test",
        "seed_artifact": str(seed),
        "model": "openai/gpt-5.5",
        "trials": [{"task_id": "task-a"}],
    }
    calls = []

    class FakeOracle:
        pass

    class FakeAgent:
        def __init__(self, **_kwargs):
            self.model = "gpt-5.5"
            self.reasoning_effort = "high"

    monkeypatch.setattr(search_method, "load_search_request", lambda _path: request)
    monkeypatch.setattr(search_method, "OracleClient", FakeOracle)
    monkeypatch.setattr(
        search_method,
        "tasks_from_request",
        lambda *_args, **_kwargs: [SimpleNamespace(id="task-a")],
    )
    monkeypatch.setattr(search_method, "CodexAgent", FakeAgent)
    monkeypatch.setattr(search_method, "codex_binary", lambda: "/fake/codex")
    monkeypatch.setattr(search_method, "configure_global_codex_pool", lambda _n: None)
    published = {}
    monkeypatch.setattr(
        search_method,
        "publish_search_result",
        lambda **kwargs: published.update(kwargs),
    )

    def fake_evolution(**kwargs):
        calls.append(("evolution", kwargs))
        return kwargs["initial"], []

    def fake_meta(**kwargs):
        calls.append(("meta", kwargs))
        return SimpleNamespace(
            records=[object()],
            best=SimpleNamespace(harness_id=kwargs["seed_harness"].id, mean_score=0.5),
        )

    monkeypatch.setattr(search_method, "run_evolution", fake_evolution)
    monkeypatch.setattr(search_method, "run_meta_harness", fake_meta)
    args = argparse.Namespace(
        request=tmp_path / "request.json",
        output=tmp_path / "output",
        mode=mode,
        max_loops=2,
        optimize_samples=1,
        candidates_per_loop=1,
        search_trials=1,
        solve_workers=1,
        reasoning_effort="high",
    )

    assert search_method.run(args) == 0
    assert calls[0][0] == expected
    if mode == "rho":
        assert calls[0][1]["n_rounds"] == 2
        assert calls[0][1]["strategy"].__class__.__name__ == "DiagnoseStrategy"
    else:
        assert calls[0][1]["iterations"] == 2
        assert calls[0][1]["test_tasks"] == []
    assert published["request_id"] == "search-test"
