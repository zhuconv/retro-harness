from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from rho.agent.codex import CodexAgent
from rho.agent.codex_pool import configure_global_codex_pool
from rho.loop import run_evolution
from rho.meta_harness.runner import run_meta_harness
from rho.method.common import (
    bare_model,
    codex_binary,
    load_search_request,
    publish_search_result,
    write_codex_config,
)
from rho.method.oracle import (
    OracleBackedAgent,
    OracleClient,
    tasks_from_request,
)
from rho.stores.harness import FilesystemHarnessStore
from rho.stores.trajectory import FilesystemTrajectoryStore
from rho.strategies.diagnose import DiagnoseStrategy


def _non_negative(value: str) -> int:
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("must be non-negative")
    return number


def _positive(value: str) -> int:
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def _positive_float(value: str) -> float:
    number = float(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rho-search")
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--mode", choices=("rho", "meta-harness"), required=True)
    parser.add_argument("--max-loops", type=_non_negative, default=1)
    parser.add_argument("--optimize-samples", type=_positive, default=1)
    parser.add_argument("--candidates-per-loop", type=_positive, default=1)
    parser.add_argument("--search-trials", type=_positive, default=1)
    parser.add_argument("--solve-workers", type=_positive, default=1)
    parser.add_argument(
        "--reasoning-effort", choices=("low", "medium", "high"), default="high"
    )
    parser.add_argument(
        "--sandbox",
        choices=("read-only", "workspace-write", "danger-full-access"),
        default=None,
    )
    parser.add_argument("--timeout-seconds", type=_positive_float, default=900.0)
    return parser


def run(args: argparse.Namespace) -> int:
    request = load_search_request(args.request.resolve())
    output = args.output.resolve()
    work = output.parent / f"retro-work-{request['request_id']}"
    if work.exists():
        shutil.rmtree(work)
    for name in ("harness", "trajectories", "rounds", "workdir", "meta"):
        (work / name).mkdir(parents=True, exist_ok=True)

    harness_store = FilesystemHarnessStore(work / "harness")
    trajectory_store = FilesystemTrajectoryStore(work / "trajectories")
    seed = harness_store.capture(Path(request["seed_artifact"]).resolve())
    oracle = OracleClient()
    tasks = tasks_from_request(request, harness=seed, oracle=oracle)
    model = str(request.get("model") or "openai/gpt-5.5")
    config = write_codex_config(work, model, args.reasoning_effort)
    configure_global_codex_pool(args.solve_workers)
    inner = CodexAgent(
        codex_config_path=config,
        model=bare_model(model),
        reasoning_effort=args.reasoning_effort,
        binary=codex_binary(),
        sandbox=args.sandbox,
        fallback_sandbox="danger-full-access",
        default_timeout_s=args.timeout_seconds,
        isolate_codex_home=True,
        ephemeral=True,
    )
    agent = OracleBackedAgent(inner, oracle)

    if args.mode == "rho":
        winner, history = run_evolution(
            train=tasks,
            n_rounds=args.max_loops,
            agent=agent,
            harness_store=harness_store,
            traj_store=trajectory_store,
            workdir=work / "workdir",
            rounds_dir=work / "rounds",
            initial=seed,
            strategy=DiagnoseStrategy(),
            optimize_samples=args.optimize_samples,
            solve_workers=args.solve_workers,
        )
        metadata = {
            "implementation": "rho.loop.run_evolution",
            "mode": args.mode,
            "max_loops": args.max_loops,
            "rounds_completed": len(history),
            "winner_harness_id": winner.id,
        }
    else:
        result = run_meta_harness(
            agent=agent,
            search_tasks=tasks,
            test_tasks=[],
            seed_harness=seed,
            harness_store=harness_store,
            traj_store=trajectory_store,
            run_meta_dir=work / "meta",
            workdir=work / "workdir",
            iterations=args.max_loops,
            candidates_per_iter=args.candidates_per_loop,
            search_trials=args.search_trials,
            solve_workers=args.solve_workers,
        )
        winner = harness_store.get(result.best.harness_id)
        metadata = {
            "implementation": "rho.meta_harness.runner.run_meta_harness",
            "mode": args.mode,
            "max_loops": args.max_loops,
            "population_size": len(result.records),
            "winner_harness_id": winner.id,
            "winner_mean_score": result.best.mean_score,
        }

    (work / "method-search-summary.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    publish_search_result(
        output=output,
        request_id=request["request_id"],
        harness=winner,
        metadata=metadata,
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    try:
        return run(build_parser().parse_args(argv))
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
