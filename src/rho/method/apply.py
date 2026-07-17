from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from rho.agent.codex import CodexAgent
from rho.method.common import (
    bare_model,
    codex_binary,
    codex_environment,
    write_apply_trajectory,
    write_codex_config,
)


APPLY_INSTRUCTIONS = """{instruction}

Persistent method context and tools are available under `.rho-method/harness/`. Read and use that
harness before solving, but do not modify it. Work directly in the current workspace and make every
task-required file change there. Finish with a concise summary of the completed work.
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rho-apply")
    parser.add_argument("instruction")
    parser.add_argument("--model", required=True)
    parser.add_argument(
        "--reasoning-effort", choices=("low", "medium", "high"), required=True
    )
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--logs", required=True)
    parser.add_argument("--harness", required=True)
    parser.add_argument(
        "--sandbox",
        choices=("read-only", "workspace-write", "danger-full-access"),
        default=None,
    )
    return parser


def run(args: argparse.Namespace) -> int:
    workspace = Path(args.workspace).resolve()
    logs = Path(args.logs).resolve()
    harness = Path(args.harness).resolve()
    if not workspace.is_dir():
        raise ValueError(f"workspace not found: {workspace}")
    if not harness.is_dir():
        raise ValueError(f"harness not found: {harness}")
    method_root = workspace / ".rho-method"
    if method_root.exists():
        shutil.rmtree(method_root)
    (method_root / "harness").mkdir(parents=True)
    shutil.copytree(harness, method_root / "harness", dirs_exist_ok=True)
    config = write_codex_config(logs, args.model, args.reasoning_effort)
    agent = CodexAgent(
        codex_config_path=config,
        model=bare_model(args.model),
        reasoning_effort=args.reasoning_effort,
        binary=codex_binary(),
        sandbox=args.sandbox,
        fallback_sandbox="danger-full-access",
        isolate_codex_home=True,
        ephemeral=True,
    )
    try:
        trajectory = agent.run(
            workspace,
            APPLY_INSTRUCTIONS.format(instruction=args.instruction),
            task_id="harbor-task",
            harness_id=harness.name,
            kind="solve",
            env=codex_environment(include_task_environment=True),
        )
        write_apply_trajectory(logs, trajectory)
        return 0 if trajectory.exit_code == 0 and not trajectory.timed_out else 1
    finally:
        shutil.rmtree(method_root, ignore_errors=True)
        shutil.rmtree(workspace / ".rho", ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    try:
        return run(build_parser().parse_args(argv))
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
