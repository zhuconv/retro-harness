from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

SEARCH_REQUEST_SCHEMA = "alpha-method-search-request/v1"
SEARCH_RESULT_SCHEMA = "alpha-method-search-result/v1"


def load_search_request(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid search request JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError("search request must be a JSON object")
    if value.get("schema_version") != SEARCH_REQUEST_SCHEMA:
        raise ValueError("unsupported search request schema")
    if not isinstance(value.get("request_id"), str) or not value["request_id"]:
        raise ValueError("search request has no request_id")
    seed = value.get("seed_artifact")
    if not isinstance(seed, str) or not Path(seed).is_dir():
        raise ValueError("search request seed_artifact is not a directory")
    trials = value.get("trials")
    if not isinstance(trials, list) or not trials:
        raise ValueError("search request has no train trials")
    return value


def bare_model(model: str) -> str:
    return model.split("/", 1)[-1]


def codex_binary() -> str:
    installed = Path(sys.executable).resolve().parent / "codex"
    if installed.is_file():
        return str(installed)
    ambient = shutil.which("codex")
    if ambient:
        return ambient
    raise FileNotFoundError("codex binary is not installed")


def write_codex_config(directory: Path, model: str, reasoning_effort: str) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    base_url = (os.environ.get("OPENAI_BASE_URL") or "").rstrip("/")
    lines = [
        f"model = {json.dumps(bare_model(model))}",
        f"model_reasoning_effort = {json.dumps(reasoning_effort)}",
    ]
    if base_url:
        if not os.environ.get("OPENAI_API_KEY"):
            raise ValueError("OPENAI_API_KEY is required with OPENAI_BASE_URL")
        lines.extend(
            [
                'model_provider = "alpha_eval"',
                "",
                "[model_providers.alpha_eval]",
                'name = "alpha-eval gateway"',
                f"base_url = {json.dumps(base_url)}",
                'env_key = "OPENAI_API_KEY"',
                'wire_api = "responses"',
            ]
        )
    path = directory / "codex-config.toml"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def codex_environment(*, include_task_environment: bool = False) -> dict[str, str]:
    if include_task_environment:
        return {
            key: value
            for key, value in os.environ.items()
            if not key.startswith(("METHOD_", "ALPHA_SEARCH_ORACLE_"))
        }
    return {
        key: value
        for key in ("OPENAI_API_KEY", "OPENAI_BASE_URL")
        if (value := os.environ.get(key)) is not None
    }


def write_apply_trajectory(logs: Path, trajectory: Any) -> None:
    atif = logs / "atif" / "trajectory.jsonl"
    atif.parent.mkdir(parents=True, exist_ok=True)
    with atif.open("w", encoding="utf-8") as handle:
        for event in trajectory.events:
            handle.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")
        handle.write(
            json.dumps(
                {"type": "rho_final_message", "text": trajectory.final_message},
                ensure_ascii=False,
            )
            + "\n"
        )
    (logs / "status.json").write_text(
        json.dumps(
            {
                "exit_code": trajectory.exit_code,
                "timed_out": trajectory.timed_out,
                "wall_time_s": trajectory.wall_time_s,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def publish_search_result(
    *,
    output: Path,
    request_id: str,
    harness: Any,
    metadata: dict[str, Any],
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.tmp")
    if temporary.exists():
        shutil.rmtree(temporary)
    artifact = temporary / "artifact"
    artifact.mkdir(parents=True)
    harness.materialize(artifact)
    (temporary / "search-result.json").write_text(
        json.dumps(
            {
                "schema_version": SEARCH_RESULT_SCHEMA,
                "request_id": request_id,
                "artifact": "artifact",
                "metadata": metadata,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    if output.exists():
        shutil.rmtree(output)
    temporary.replace(output)
