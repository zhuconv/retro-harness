from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from rho.agent.base import Agent
from rho.protocols import Grade, Harness, Trajectory, TrajectoryKind

ORACLE_PROTOCOL = "alpha-eval-search-oracle/v1"
ORACLE_REQUEST_SCHEMA = "alpha-eval-search-evaluation-request/v1"
ORACLE_RESPONSE_SCHEMA = "alpha-eval-search-evaluation-response/v1"


class OracleClient:
    def __init__(self) -> None:
        self.url = os.environ.get("ALPHA_SEARCH_ORACLE_URL", "")
        self.token = os.environ.get("ALPHA_SEARCH_ORACLE_TOKEN", "")
        protocol = os.environ.get("ALPHA_SEARCH_ORACLE_PROTOCOL", "")
        if not self.url or not self.token:
            raise ValueError("Search requires ALPHA_SEARCH_ORACLE_URL and token")
        if protocol != ORACLE_PROTOCOL:
            raise ValueError(f"unsupported Search oracle protocol: {protocol!r}")
        self._grades: dict[str, dict[str, Any]] = {}

    def solve(
        self,
        *,
        workspace: Path,
        instructions: str,
        task_id: str,
        harness_id: str,
        model: str | None,
        reasoning_effort: str | None,
    ) -> Trajectory:
        candidate = workspace / "harness"
        sample_index = None
        sample_path = workspace / ".sample_index"
        if sample_path.is_file():
            try:
                sample_index = int(sample_path.read_text().strip())
            except ValueError:
                sample_index = None
        payload = {
            "schema_version": ORACLE_REQUEST_SCHEMA,
            "task_id": task_id,
            "candidate_artifact": str(candidate.resolve()),
            "sample_index": sample_index,
            "stage": "retro_solve",
        }
        request = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=None) as response:
                result = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise RuntimeError(f"Search oracle HTTP {exc.code}: {detail}") from exc
        if not isinstance(result, dict) or result.get(
            "schema_version"
        ) != ORACLE_RESPONSE_SCHEMA:
            raise RuntimeError("Search oracle returned an invalid response")
        evaluation_id = str(result.get("evaluation_id", "unknown"))
        trajectory_id = f"traj_oracle_{evaluation_id.replace('-', '_')}"
        events = _read_events(result.get("trajectory"))
        events.append(
            {
                "type": "alpha_eval_oracle_ref",
                "evaluation_id": evaluation_id,
                "candidate_sha256": result.get("candidate_sha256"),
            }
        )
        self._grades[trajectory_id] = result
        return Trajectory(
            id=trajectory_id,
            kind="solve",
            task_id=task_id,
            harness_id=harness_id,
            instructions=instructions,
            events=events,
            final_message=str(result.get("final_message") or ""),
            stdout=json.dumps(
                {
                    "evaluation_id": evaluation_id,
                    "trajectory": result.get("trajectory"),
                },
                sort_keys=True,
            ),
            stderr=str(result.get("exception") or ""),
            workspace_diff={},
            workspace_deletions=frozenset(),
            exit_code=int(result.get("returncode") or 0),
            wall_time_s=float(result.get("seconds") or 0.0),
            timed_out=False,
            sample_index=sample_index,
            model=model,
            reasoning_effort=reasoning_effort,
        )

    def grade(self, trajectory: Trajectory) -> Grade:
        try:
            result = self._grades[trajectory.id]
        except KeyError as exc:
            raise ValueError(
                f"trajectory {trajectory.id!r} was not produced by this oracle"
            ) from exc
        reward = result.get("reward")
        score = float(reward) if isinstance(reward, (int, float)) else 0.0
        return Grade(
            passed=score > 0.0,
            score=score,
            details={
                "evaluation_id": result.get("evaluation_id"),
                "metrics": result.get("metrics"),
                "candidate_sha256": result.get("candidate_sha256"),
            },
        )


class OracleBackedAgent:
    """Keep retro's model calls unchanged while routing solve calls through Harbor."""

    def __init__(self, inner: Agent, oracle: OracleClient):
        self.inner = inner
        self.oracle = oracle

    def run(
        self,
        workspace: Path,
        instructions: str,
        *,
        output_schema: dict[str, Any] | None = None,
        task_id: str = "",
        harness_id: str = "",
        kind: TrajectoryKind = "solve",
        timeout_s: float | None = None,
        env: dict[str, str] | None = None,
    ) -> Trajectory:
        if kind == "solve":
            return self.oracle.solve(
                workspace=workspace,
                instructions=instructions,
                task_id=task_id,
                harness_id=harness_id,
                model=getattr(self.inner, "model", None),
                reasoning_effort=getattr(self.inner, "reasoning_effort", None),
            )
        merged_env = dict(env or {})
        for key in ("OPENAI_API_KEY", "OPENAI_BASE_URL"):
            if value := os.environ.get(key):
                merged_env[key] = value
        return self.inner.run(
            workspace,
            instructions,
            output_schema=output_schema,
            task_id=task_id,
            harness_id=harness_id,
            kind=kind,
            timeout_s=timeout_s,
            env=merged_env,
        )


class OracleTask:
    def __init__(self, task_id: str, query: str, harness: Harness, oracle: OracleClient):
        self._id = task_id
        self._query = query
        self._harness = harness
        self._oracle = oracle

    @property
    def id(self) -> str:
        return self._id

    @property
    def harness(self) -> Harness:
        return self._harness

    @property
    def agent_timeout_s(self) -> float | None:
        return None

    def query(self) -> str:
        return self._query

    def materialize(self, dest: Path) -> None:
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "prompt.md").write_text(self._query, encoding="utf-8")

    def grade(
        self, trajectory: Trajectory, *, artifacts_dir: Path | None = None
    ) -> Grade:
        del artifacts_dir
        return self._oracle.grade(trajectory)


def tasks_from_request(
    request: dict[str, Any], *, harness: Harness, oracle: OracleClient
) -> list[OracleTask]:
    tasks: list[OracleTask] = []
    seen: set[str] = set()
    for trial in request["trials"]:
        if not isinstance(trial, dict) or not isinstance(trial.get("task_id"), str):
            raise ValueError("Search request contains an invalid trial")
        task_id = trial["task_id"]
        if task_id in seen:
            continue
        seen.add(task_id)
        query = _task_query(trial, task_id)
        tasks.append(OracleTask(task_id, query, harness, oracle))
    if not tasks:
        raise ValueError("Search request contains no unique train tasks")
    return tasks


def _task_query(trial: dict[str, Any], task_id: str) -> str:
    raw = trial.get("task")
    if isinstance(raw, str):
        instruction = Path(raw) / "instruction.md"
        if instruction.is_file():
            return instruction.read_text(encoding="utf-8", errors="replace")
    return f"Solve benchmark task {task_id}."


def _read_events(raw_path: object) -> list[dict[str, Any]]:
    if not isinstance(raw_path, str) or not Path(raw_path).is_file():
        return []
    events: list[dict[str, Any]] = []
    for line in Path(raw_path).read_text(errors="replace").splitlines():
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            value = {"type": "raw_trajectory", "line": line}
        if isinstance(value, dict) and value.get("type") != "rho_final_message":
            events.append(value)
    return events
