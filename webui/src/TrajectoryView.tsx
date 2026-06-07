import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  type TraceChunk,
  type TracePayload,
  type TraceStep,
  type TrajectoryDetail,
  type TrajectoryScore,
  fetchJson,
  fetchText,
} from "./api";

type LoadState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

export function TrajectoryView({ runId, trajId, compact = false }: { runId: string; trajId: string; compact?: boolean }) {
  const trajectory = useJson<TrajectoryDetail>(`/api/runs/${runId}/trajectories/${trajId}`);
  const trace = useJson<TracePayload>(`/api/runs/${runId}/trajectories/${trajId}/trace`);
  const [artifactName, setArtifactName] = useState("final_message");
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const location = useLocation();
  const artifact = useText(`/api/runs/${runId}/trajectories/${trajId}/artifacts/${artifactName}`);
  const workspaceEntry = trajectory.data?.workspace_diff_files.find((entry) => entry.path === workspacePath) ?? null;
  const workspaceIsBinary = workspaceEntry ? isBinaryPath(workspaceEntry.path) : false;
  const workspaceText = useText(
    workspacePath && !workspaceIsBinary
      ? `/api/runs/${runId}/trajectories/${trajId}/workspace-diff/${encodePath(workspacePath)}`
      : null,
  );
  const firstFailureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setWorkspacePath(null);
  }, [location.pathname, trajId]);

  const firstFailureId = useMemo(() => {
    return trace.data?.steps.find((step) => step.kind === "command" && Number(step.metrics.exit_code) !== 0)?.id ?? null;
  }, [trace.data?.steps]);

  function jumpToFirstFailure() {
    firstFailureRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (trajectory.loading || trace.loading) {
    return <Loading />;
  }
  if (trajectory.error) {
    return <ErrorPanel error={trajectory.error} />;
  }
  if (trace.error) {
    return <ErrorPanel error={trace.error} />;
  }
  if (!trajectory.data || !trace.data) {
    return <EmptyState text="Trajectory not found." />;
  }

  const meta = trajectory.data.meta;
  const harnessId = String(meta.harness_id ?? "");

  return (
    <div className={`trajectory-reader ${compact ? "compact" : ""}`}>
      <header className="trajectory-sticky-head">
        <div className="trajectory-title-block">
          <div className="trajectory-title">{trajId}</div>
          <div className="trajectory-meta-line">
            <span>{String(meta.task_id ?? "*")}</span>
            <span>{String(meta.kind ?? "unknown")}</span>
            <span>{String(meta.stage ?? "(none)")}</span>
            <span>{formatDuration(numberValue(meta.wall_time_s))}</span>
            <span>exit {String(meta.exit_code ?? "n/a")}</span>
          </div>
          <div className="harness-links">{renderHarnessLinks(runId, harnessId)}</div>
        </div>
        <div className="trajectory-head-actions">
          <ScoreBadge score={trajectory.data.score} />
          {firstFailureId ? (
            <button className="ghost-button" onClick={jumpToFirstFailure}>
              jump to first failure
            </button>
          ) : null}
        </div>
      </header>
      <div className="trajectory-layout">
        <main className="transcript-column">
          {trajectory.data.instructions_excerpt ? (
            <section className="prompt-excerpt">
              <h2>Instructions</h2>
              <TextBlock text={trajectory.data.instructions_excerpt} compact />
            </section>
          ) : null}
          <div className="transcript-list">
            {trace.data.steps.map((step) => (
              <div
                key={step.id}
                ref={step.id === firstFailureId ? firstFailureRef : undefined}
              >
                <TranscriptStep runId={runId} trajId={trajId} step={step} />
              </div>
            ))}
          </div>
        </main>
        <aside className="trajectory-rail">
          <div className="rail-tabs">
            {[
              ["final_message", "final"],
              ["instructions", "instructions"],
              ["stdout", "stdout"],
              ["events_raw", "events raw"],
            ].map(([name, label]) => (
              <button
                key={name}
                className={`chip ${artifactName === name ? "active" : ""}`}
                onClick={() => setArtifactName(name)}
              >
                {label}
              </button>
            ))}
          </div>
          {artifact.loading ? (
            <Loading compact />
          ) : artifact.error ? (
            <ErrorPanel error={artifact.error} compact />
          ) : artifactName === "final_message" && !looksLikeJson(artifact.text) ? (
            <MarkdownBlock text={artifact.text || ""} />
          ) : (
            <CodeBlock text={artifact.text || ""} language={languageForPath(artifactName)} />
          )}
          <div className="rail-section-title">Workspace files</div>
          <div className="file-list compact-list">
            {trajectory.data.workspace_diff_files.map((entry) => (
              <button
                className={`list-button ${workspacePath === entry.path ? "active" : ""}`}
                key={entry.path}
                onClick={() => setWorkspacePath(entry.path)}
              >
                <span>{entry.path}</span>
                <span className="muted">{formatBytes(entry.size)}</span>
              </button>
            ))}
          </div>
          {workspaceEntry ? (
            workspaceIsBinary ? (
              <EmptyState text={`Binary file, ${formatBytes(workspaceEntry.size)}.`} />
            ) : workspaceText.loading ? (
              <Loading compact />
            ) : workspaceText.error ? (
              <ErrorPanel error={workspaceText.error} compact />
            ) : (
              <CodeBlock text={workspaceText.text || ""} language={languageForPath(workspaceEntry.path)} />
            )
          ) : (
            <EmptyState text="Pick a captured workspace file." />
          )}
        </aside>
      </div>
    </div>
  );
}

function TranscriptStep({ runId, trajId, step }: { runId: string; trajId: string; step: TraceStep }) {
  if (step.kind === "usage") {
    return (
      <div className="inline-divider">
        turn · in {formatNumber(numberValue(step.metrics.input_tokens))} · out {formatNumber(numberValue(step.metrics.output_tokens))}
      </div>
    );
  }
  if (step.kind === "boundary") {
    return <div className="inline-divider">{step.title}</div>;
  }
  if (step.kind === "agent_message") {
    return (
      <article className="message-row agent">
        <div className="message-bubble">
          <MarkdownBlock text={step.text || step.summary} />
        </div>
      </article>
    );
  }
  if (step.kind === "command") {
    return <CommandStep runId={runId} trajId={trajId} step={step} />;
  }
  return (
    <article className="message-row system">
      <div className="message-bubble system">
        <div className="step-eyebrow">{step.kind}</div>
        <div className="step-title">{step.title}</div>
        {step.summary ? <p>{step.summary}</p> : null}
        <Preview step={step} />
      </div>
    </article>
  );
}

function CommandStep({ runId, trajId, step }: { runId: string; trajId: string; step: TraceStep }) {
  const [expanded, setExpanded] = useState(false);
  const [chunk, setChunk] = useState<TraceChunk | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failed = Number(step.metrics.exit_code) !== 0;

  useEffect(() => {
    if (!expanded || !step.raw_available || chunk || loading) {
      return;
    }
    setLoading(true);
    fetchJson<TraceChunk>(`/api/runs/${runId}/trajectories/${trajId}/trace/${step.id}/output`)
      .then((value) => {
        setChunk(value);
        setError(null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, [chunk, expanded, loading, runId, step.id, step.raw_available, trajId]);

  async function loadMore() {
    if (!chunk?.has_more) {
      return;
    }
    setLoading(true);
    try {
      const next = await fetchJson<TraceChunk>(
        `/api/runs/${runId}/trajectories/${trajId}/trace/${step.id}/output?start_line=${chunk.end_line}&max_lines=120`,
      );
      setChunk({ ...next, start_line: chunk.start_line, lines: [...chunk.lines, ...next.lines] });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className={`terminal-step ${failed ? "failed" : ""}`}>
      <div className="terminal-head">
        <div>
          <div className="terminal-command">{step.title}</div>
          <div className="terminal-subtitle">{step.subtitle || step.summary}</div>
        </div>
        <button className="ghost-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "collapse" : "output"}
        </button>
      </div>
      {expanded ? (
        <div className="terminal-output">
          {loading ? <Loading compact /> : null}
          {error ? <ErrorPanel error={error} compact /> : null}
          {chunk ? <CodeBlock text={chunk.lines.join("\n")} language="text" /> : <Preview step={step} />}
          {chunk?.has_more ? (
            <button className="ghost-button" onClick={loadMore}>
              load more
            </button>
          ) : null}
        </div>
      ) : (
        <div className="terminal-summary">{step.summary || "Output collapsed."}</div>
      )}
    </article>
  );
}

function Preview({ step }: { step: TraceStep }) {
  if (!step.preview) {
    return null;
  }
  switch (step.preview.mode) {
    case "text":
      return <CodeBlock text={step.preview.lines.join("\n")} language="text" />;
    case "todo":
      return (
        <ul className="todo-preview">
          {step.preview.items.map((item) => (
            <li key={item.text} className={item.completed ? "done" : ""}>
              {item.completed ? "✓" : "□"} {item.text}
            </li>
          ))}
        </ul>
      );
    case "file_change":
      return (
        <ul className="path-preview">
          {step.preview.paths.map((entry) => (
            <li key={`${entry.kind}-${entry.path}`}>
              <span className="mono">{entry.path}</span>
              <span className="status-badge muted">{entry.kind}</span>
            </li>
          ))}
        </ul>
      );
    case "queries":
      return (
        <ul className="path-preview">
          {[step.preview.query, ...step.preview.queries].filter(Boolean).map((query) => (
            <li key={query}>
              <span className="mono">{query}</span>
            </li>
          ))}
        </ul>
      );
    case "json":
      return <CodeBlock text={JSON.stringify(step.preview.value, null, 2)} language="json" />;
    default:
      return <CodeBlock text={step.summary} language="text" />;
  }
}

export function ScoreBadge({ score }: { score: TrajectoryScore | null | undefined }) {
  if (!score || score.kind === "ungraded") {
    return <span className="status-badge muted">ungraded</span>;
  }
  if (score.kind === "consistency") {
    return (
      <span className={`status-badge ${Number(score.score) >= 0 ? "good" : "warn"}`}>
        consistency {formatSigned(score.score)}
      </span>
    );
  }
  const passed = score.ctrf ? `${score.ctrf.passed}/${score.ctrf.total}` : formatFloat(score.score);
  return <span className={`status-badge ${score.score === 1 ? "good" : "warn"}`}>ctrf {passed}</span>;
}

function renderHarnessLinks(runId: string, harnessId: string) {
  if (!harnessId) {
    return <span className="muted">unknown harness</span>;
  }
  return harnessId.split("->").map((part, index, parts) => (
    <span key={`${part}-${index}`}>
      <Link to={`/runs/${runId}/harness/${part}`}>{part}</Link>
      {index < parts.length - 1 ? <span className="muted"> → </span> : null}
    </span>
  ));
}

function MarkdownBlock({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(Boolean);
  if (!blocks.length) {
    return <div className="markdown-body muted">(empty)</div>;
  }
  return (
    <div className="markdown-body">
      {blocks.map((block, index) => {
        if (block.startsWith("```")) {
          return <CodeBlock key={index} text={block.replace(/^```\w*\n?/, "").replace(/```$/, "")} language="text" />;
        }
        if (block.startsWith("# ")) {
          return <h2 key={index}>{block.slice(2)}</h2>;
        }
        if (block.startsWith("## ")) {
          return <h3 key={index}>{block.slice(3)}</h3>;
        }
        if (block.split("\n").every((line) => line.trim().startsWith("- "))) {
          return (
            <ul key={index}>
              {block.split("\n").map((line) => (
                <li key={line}>{renderInlineMarkdown(line.trim().slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{renderInlineMarkdown(block)}</p>;
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) =>
    part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : <span key={index}>{part}</span>,
  );
}

function CodeBlock({ text, language }: { text: string; language: string }) {
  if (looksLikeDiff(text) || language === "diff") {
    return (
      <pre className="code-block diff-block">
        {text.split("\n").map((line, index) => (
          <span key={index} className={`diff-line ${diffLineClass(line)}`}>
            {line || " "}
          </span>
        ))}
      </pre>
    );
  }
  return <pre className={`code-block lang-${language}`}>{text || "(empty)"}</pre>;
}

function TextBlock({ text, compact = false }: { text: string; compact?: boolean }) {
  return <pre className={`code-block ${compact ? "compact" : ""}`}>{text || "(empty)"}</pre>;
}

function ErrorPanel({ error, compact = false }: { error: string; compact?: boolean }) {
  return <div className={`error-panel ${compact ? "compact" : ""}`}>{error}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function Loading({ compact = false }: { compact?: boolean }) {
  return <div className={`loading ${compact ? "compact" : ""}`}>Loading…</div>;
}

function useJson<T>(path: string): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<T>(path)
      .then((value) => {
        if (!cancelled) {
          setData(value);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return { data, error, loading };
}

function useText(path: string | null) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!path) {
      setText("");
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchText(path)
      .then((value) => {
        if (!cancelled) {
          setText(value);
          setError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return { text, error, loading };
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function formatFloat(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "n/a";
}

export function formatDuration(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "n/a";
  }
  if (value < 60) {
    return `${value.toFixed(1)}s`;
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds}s`;
}

export function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "n/a";
}

function formatSigned(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "n/a";
  }
  return value > 0 ? `+${value}` : String(value);
}

function formatBytes(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "n/a";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function languageForPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "py") return "python";
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx") return "javascript";
  if (ext === "json") return "json";
  if (ext === "md") return "markdown";
  if (ext === "patch" || ext === "diff") return "diff";
  return "text";
}

function looksLikeJson(text: string) {
  return text.trim().startsWith("{") || text.trim().startsWith("[");
}

function looksLikeDiff(text: string) {
  const trimmed = text.trimStart();
  return trimmed.startsWith("diff --git") || trimmed.startsWith("--- ") || trimmed.startsWith("+++ ");
}

function diffLineClass(line: string) {
  if (line.startsWith("+") && !line.startsWith("+++")) return "add";
  if (line.startsWith("-") && !line.startsWith("---")) return "del";
  if (line.startsWith("@@")) return "hunk";
  return "ctx";
}

function isBinaryPath(path: string) {
  return /\.(bmp|gif|ico|jpg|jpeg|pdf|png|ppm|tar|tgz|zip)$/i.test(path);
}
