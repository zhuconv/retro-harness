import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useParams } from "react-router-dom";

import {
  type RoundDetail,
  type RunDetail,
  type RunSummary,
  type HarnessDetail,
  type SelectionCandidate,
  type SelectionDetail,
  type TaskDetail,
  type TrajectoryDetail,
  type TrajectoryScore,
  type TrajectorySummary,
  fetchJson,
  fetchText,
} from "./api";
import { ScoreBadge, TrajectoryView } from "./TrajectoryView";

export function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <Link className="brand" to="/">
            rho runs
          </Link>
          <p className="topbar-copy">Structured browsing for rounds, trajectories, traces, and logs.</p>
        </div>
      </header>
      <main className="page-shell">
        <Routes>
          <Route path="/" element={<RunsPage />} />
          <Route path="/runs/:runId" element={<RunPage />} />
          <Route path="/runs/:runId/selection" element={<SelectionPage />} />
          <Route path="/runs/:runId/tasks/:taskId" element={<TaskJourneyPage />} />
          <Route path="/runs/:runId/harness/:harnessId" element={<HarnessPage />} />
          <Route path="/runs/:runId/trajectories/:trajId" element={<TrajectoryPage />} />
          <Route path="/compare" element={<ComparePage />} />
        </Routes>
      </main>
    </div>
  );
}

function RunsPage() {
  const { data, error, loading } = useJson<RunSummary[]>("/api/runs");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!data) {
      return [];
    }
    if (!normalized) {
      return data;
    }
    return data.filter((run) => {
      const haystack = [
        run.name,
        run.dataset_spec ?? "",
        run.initial_harness_id ?? "",
        run.final_harness_id ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [data, query]);

  return (
    <Page>
      <SectionHeader
        title="Runs"
        subtitle="Browse the current on-disk runs and jump straight into the trajectories that matter."
      />
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Filter by run, dataset, or harness"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {loading ? <Loading /> : null}
      {error ? <ErrorPanel error={error} /> : null}
      <div className="run-list">
        {filtered.map((run) => (
          <Link className="run-row" key={run.id} to={`/runs/${run.id}`}>
            <div>
              <div className="run-title">{run.name}</div>
              <div className="muted">{run.dataset_spec || "unknown dataset"}</div>
            </div>
            <div className="run-meta">
              <Metric label="rounds" value={String(run.round_count)} compact />
              <Metric label="traces" value={String(run.trajectory_count)} compact />
              <Metric label="final mean" value={formatFloat(run.final_val?.mean_score)} compact />
              <Metric
                label="output"
                value={formatNumber(run.usage?.output_tokens)}
                compact
              />
            </div>
          </Link>
        ))}
      </div>
    </Page>
  );
}

function RunPage() {
  const { runId = "" } = useParams();
  const { data, error, loading } = useJson<RunDetail>(`/api/runs/${runId}`);
  const hasRound = !!data && data.rounds.length > 0;
  const round = useJson<RoundDetail>(hasRound ? `/api/runs/${runId}/rounds/0` : "", !hasRound);
  const [reportName, setReportName] = useState<string | null>(null);
  const reportText = useText(reportName ? `/api/runs/${runId}/reports/${reportName}` : null);

  return (
    <Page>
      <Breadcrumbs
        items={[
          { label: "Runs", to: "/" },
          { label: runId },
        ]}
      />
      {loading ? <Loading /> : null}
      {error ? <ErrorPanel error={error} /> : null}
      {data ? (
        <>
          <SectionHeader title={data.name} subtitle={data.path} />
          <PipelineStrip run={data} round={round.data} runId={runId} />
          <MetricGrid
            items={[
              { label: "Trajectories", value: String(data.manifest.trajectory_count) },
              { label: "Final mean", value: formatFloat(numberAt(data.summary, ["final_val", "mean_score"])) },
              { label: "Mean score", value: formatFloat(round.data?.mean_score ?? null) },
              { label: "Input tokens", value: formatNumber(data.usage_summary.overall.input_tokens) },
              { label: "Output tokens", value: formatNumber(data.usage_summary.overall.output_tokens) },
            ]}
          />
          <TasksSection run={data} round={round.data} runId={runId} />
          {round.data ? <OptimizeSection round={round.data} runId={runId} /> : null}
          {round.data ? <RoundReadablePanels data={round.data} /> : null}
          {round.data ? (
            <section className="section">
              <div className="section-title-row">
                <h2>Candidate diff</h2>
              </div>
              <DiffBlock text={round.data.candidate_harness_diff} />
            </section>
          ) : null}
          <div className="split-layout">
            <section className="section">
              <div className="section-title-row">
                <h2>Reports</h2>
              </div>
              <div className="report-list">
                {data.reports.map((report) => (
                  <button
                    className={`list-button ${reportName === report.name ? "active" : ""}`}
                    key={report.name}
                    onClick={() => setReportName(report.name)}
                  >
                    <span>{report.name}</span>
                    <span className="muted">{formatBytes(report.size)}</span>
                  </button>
                ))}
              </div>
              <details className="details-block">
                <summary>Config and environment</summary>
                <JsonBlock value={{ config: data.config, environment: data.environment }} />
              </details>
            </section>
            <section className="section">
              <div className="section-title-row">
                <h2>{reportName || "Report preview"}</h2>
              </div>
              {reportName ? (
                reportText.loading ? (
                  <Loading />
                ) : reportText.error ? (
                  <ErrorPanel error={reportText.error} />
                ) : (
                  <TextBlock text={reportText.text || ""} />
                )
              ) : (
                <EmptyState text="Pick a report to inspect it." />
              )}
            </section>
          </div>
        </>
      ) : null}
    </Page>
  );
}

const STAGE_LABELS: Record<string, string> = {
  round_solve_before: "Solve before",
  round_diagnose: "Diagnose",
  round_optimize: "Optimize",
  round_solve_after: "Solve after",
  round_evaluate: "Evaluate",
  final_val_grade: "Final grade",
  cli_val_grade: "Final grade",
};

const STAGE_ORDER = [
  "round_solve_before",
  "round_diagnose",
  "round_solve_after",
  "round_evaluate",
  "final_val_grade",
  "cli_val_grade",
];

function stageLabel(stage: string | undefined): string {
  if (!stage) return "(none)";
  return STAGE_LABELS[stage] ?? stage;
}

function TasksSection({ run, round, runId }: { run: RunDetail; round: RoundDetail | null; runId: string }) {
  const grouped = useMemo(() => groupTrajectoriesByTask(run.trajectories), [run.trajectories]);
  if (!grouped.length) {
    return null;
  }
  return (
    <section className="section">
      <div className="section-title-row">
        <h2>Tasks</h2>
        {run.selection_present ? (
          <Link className="ghost-button" to={`/runs/${runId}/selection`}>
            selection
          </Link>
        ) : null}
      </div>
      <div className="task-tree">
        {grouped.map((task) => (
          <TaskTreeRow key={task.task_id} task={task} runId={runId} round={round} />
        ))}
      </div>
    </section>
  );
}

type GroupedTask = {
  task_id: string;
  trajectories: TrajectorySummary[];
  by_stage: { stage: string; trajectories: TrajectorySummary[] }[];
};

function groupTrajectoriesByTask(trajectories: TrajectorySummary[]): GroupedTask[] {
  const buckets = new Map<string, TrajectorySummary[]>();
  for (const traj of trajectories) {
    const taskId = traj.task_id;
    if (!taskId || taskId === "*") continue;
    if (!buckets.has(taskId)) buckets.set(taskId, []);
    buckets.get(taskId)!.push(traj);
  }
  return Array.from(buckets.entries())
    .map(([task_id, trajs]) => ({
      task_id,
      trajectories: trajs,
      by_stage: groupByStage(trajs),
    }))
    .sort((a, b) => a.task_id.localeCompare(b.task_id));
}

function groupByStage(trajectories: TrajectorySummary[]): { stage: string; trajectories: TrajectorySummary[] }[] {
  const map = new Map<string, TrajectorySummary[]>();
  for (const traj of trajectories) {
    const stage = traj.stage || "(none)";
    if (!map.has(stage)) map.set(stage, []);
    map.get(stage)!.push(traj);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.sample_index ?? 0) - (b.sample_index ?? 0));
  }
  return Array.from(map.entries()).sort((a, b) => stageRank(a[0]) - stageRank(b[0])).map(([stage, trajectories]) => ({
    stage,
    trajectories,
  }));
}

function stageRank(stage: string): number {
  const ix = STAGE_ORDER.indexOf(stage);
  return ix === -1 ? STAGE_ORDER.length : ix;
}

function TaskTreeRow({ task, runId, round }: { task: GroupedTask; runId: string; round: RoundDetail | null }) {
  const diagnosis = useMemo(() => {
    if (!round) return null;
    return round.diagnoses.find((d) => (d as Record<string, unknown>).task_id === task.task_id) ?? null;
  }, [round, task.task_id]);
  return (
    <details className="task-tree-row">
      <summary>
        <span className="task-tree-id">{task.task_id}</span>
        <span className="muted">
          {task.trajectories.length} traj · {task.by_stage.map((g) => stageLabel(g.stage)).join(" · ")}
        </span>
        <Link className="ghost-button" to={`/runs/${runId}/tasks/${task.task_id}`} onClick={stopPropagation}>
          journey →
        </Link>
      </summary>
      <div className="task-tree-body">
        {task.by_stage.map((group) => (
          <div className="task-stage-block" key={group.stage}>
            <div className="task-stage-title">{stageLabel(group.stage)}</div>
            <div className="table-list compact-list">
              {group.trajectories.map((traj) => (
                <Link
                  className="table-row task-traj-row"
                  key={traj.id}
                  to={`/runs/${runId}/trajectories/${traj.id}`}
                >
                  <span className="mono">{traj.id}</span>
                  <span className="muted">{traj.harness_id || "unknown harness"}</span>
                  <span>{typeof traj.sample_index === "number" ? `sample ${traj.sample_index}` : ""}</span>
                  <span>{formatDuration(traj.wall_time_s)}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
        {diagnosis ? (
          <details className="details-block">
            <summary>Diagnosis</summary>
            <JsonBlock value={diagnosis} />
          </details>
        ) : null}
      </div>
    </details>
  );
}

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function OptimizeSection({ round, runId }: { round: RoundDetail; runId: string }) {
  const trajectories = round.optimize_trajectories.length
    ? round.optimize_trajectories
    : round.optimize_trajectory
      ? [round.optimize_trajectory]
      : [];
  if (!trajectories.length) {
    return null;
  }
  return (
    <section className="section">
      <div className="section-title-row">
        <h2>Optimize</h2>
        <span className="muted">harness-level rewrites — shared across tasks</span>
      </div>
      <div className="table-list compact-list">
        {trajectories.map((traj) => (
          <Link
            className="table-row task-traj-row"
            key={traj.id}
            to={`/runs/${runId}/trajectories/${traj.id}`}
          >
            <span className="mono">{traj.id}</span>
            <span className="muted">{traj.harness_id || "unknown harness"}</span>
            <span>{typeof traj.sample_index === "number" ? `sample ${traj.sample_index}` : ""}</span>
            <span>{formatDuration(traj.wall_time_s)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function PipelineStrip({ run, round, runId }: { run: RunDetail; round: RoundDetail | null; runId: string }) {
  const finalMean = numberAt(run.summary, ["final_val", "mean_score"]);
  const diagnoseCount = round?.diagnose_trajectories.length ?? 0;
  const optimizeCount = round?.optimize_trajectories.length ?? (round?.optimize_trajectory ? 1 : 0);
  const solveAfterCount = round?.solve_after_trajectories.length ?? 0;
  const evaluateCount = round?.evaluate_trajectories.length ?? 0;
  const accepted = round?.accepted ?? null;
  return (
    <section className="pipeline-strip">
      <div className="pipeline-node">
        <span className="pipeline-label">Dataset</span>
        <span>{String(run.config.dataset_spec || "unknown")}</span>
      </div>
      <span className="pipeline-arrow">→</span>
      {run.selection_present ? (
        <Link className="pipeline-node interactive" to={`/runs/${runId}/selection`}>
          <span className="pipeline-label">Select</span>
          <span>{run.selection_summary?.k ?? "?"}/{run.selection_summary?.candidate_count ?? "?"}</span>
        </Link>
      ) : (
        <div className="pipeline-node">
          <span className="pipeline-label">Select</span>
          <span>not present</span>
        </div>
      )}
      <span className="pipeline-arrow">→</span>
      <div className="pipeline-node">
        <span className="pipeline-label">Diagnose</span>
        <span>{diagnoseCount} traj</span>
      </div>
      <span className="pipeline-arrow">→</span>
      <div className="pipeline-node">
        <span className="pipeline-label">Optimize</span>
        <span>{optimizeCount} samples</span>
      </div>
      <span className="pipeline-arrow">→</span>
      <div className="pipeline-node">
        <span className="pipeline-label">Solve after</span>
        <span>{solveAfterCount} traj</span>
      </div>
      <span className="pipeline-arrow">→</span>
      <div className="pipeline-node">
        <span className="pipeline-label">Score</span>
        <span>{formatFloat(round?.mean_score ?? null)} · {evaluateCount} eval</span>
      </div>
      <span className="pipeline-arrow">→</span>
      <div className="pipeline-node">
        <span className="pipeline-label">Decision</span>
        <span>{accepted === null ? "n/a" : accepted ? "accepted" : "rejected"}</span>
      </div>
      <span className="pipeline-arrow">→</span>
      <div className="pipeline-node">
        <span className="pipeline-label">Final grade</span>
        <span>{formatFloat(finalMean)}</span>
      </div>
    </section>
  );
}

function RoundReadablePanels({ data }: { data: RoundDetail }) {
  const candidates = Array.isArray(data.optimize_candidates.unique_candidates)
    ? data.optimize_candidates.unique_candidates as Record<string, unknown>[]
    : [];
  return (
    <div className="round-panels">
      <section className="section">
        <div className="section-title-row">
          <h2>Candidates</h2>
        </div>
        <div className="table-list compact-list">
          {candidates.map((candidate, index) => (
            <div className="table-row candidate-row" key={String(candidate.candidate_harness_id ?? index)}>
              <span>{String(candidate.candidate_harness_id ?? "unknown")}</span>
              <span>samples {arrayText(candidate.sample_indices)}</span>
              <span>{formatFloat(numberValue(candidate.mean_score))}</span>
              <StatusBadge value={candidate.winner ? "winner" : candidate.accepted ? "accepted" : "candidate"} tone={candidate.winner ? "good" : "muted"} />
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-title-row">
          <h2>Diagnoses</h2>
        </div>
        <div className="diagnosis-list">
          {data.diagnoses.map((diagnosis) => (
            <article className="diagnosis-card" key={String(diagnosis.task_id)}>
              <h3>{String(diagnosis.task_id ?? "unknown task")}</h3>
              {Array.isArray(diagnosis.trajectory_analyses) ? (
                diagnosis.trajectory_analyses.map((analysis: Record<string, unknown>, index: number) => (
                  <div className="diagnosis-analysis" key={index}>
                    <StatusBadge value={analysis.successful ? "successful" : "unsuccessful"} tone={analysis.successful ? "good" : "warn"} />
                    <span className="mono">{String(analysis.trajectory ?? "")}</span>
                    <p>{String(analysis.quality_analysis ?? analysis.issues ?? "")}</p>
                  </div>
                ))
              ) : null}
              {diagnosis.inconsistency_analysis ? <p>{String(diagnosis.inconsistency_analysis)}</p> : null}
              {diagnosis.failure_mode_analysis ? <p>{String(diagnosis.failure_mode_analysis)}</p> : null}
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-title-row">
          <h2>Scores</h2>
          <span className="muted">self-consistency preference values</span>
        </div>
        <div className="table-list compact-list">
          {data.scores.map((score, index) => (
            <div className="table-row score-row" key={`${String(score.task_id)}-${index}`}>
              <span>{String(score.task_id ?? "unknown")}</span>
              <span>{String(score.value ?? "n/a")}</span>
              <span>{String(score.rationale ?? "")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SelectionPage() {
  const { runId = "" } = useParams();
  const { data, error, loading } = useJson<SelectionDetail>(`/api/runs/${runId}/selection`);
  const [sortKey, setSortKey] = useState<"pick" | "difficulty">("pick");
  const candidates = useMemo(() => {
    const rows = [...(data?.candidates ?? [])];
    rows.sort((a, b) => {
      if (sortKey === "difficulty") {
        return (b.difficulty_score ?? -Infinity) - (a.difficulty_score ?? -Infinity);
      }
      return (a.dpp_pick?.step ?? 10_000) - (b.dpp_pick?.step ?? 10_000);
    });
    return rows;
  }, [data?.candidates, sortKey]);

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Runs", to: "/" }, { label: runId, to: `/runs/${runId}` }, { label: "Selection" }]} />
      {loading ? <Loading /> : null}
      {error ? <ErrorPanel error={error} /> : null}
      {data ? (
        <>
          <SectionHeader
            title="Selection"
            subtitle={`${data.selector ?? "selector"} · k=${data.k ?? "?"} · theta=${data.theta ?? "?"} · seed=${data.seed ?? "?"}`}
          />
          <div className="toolbar">
            <div className="chip-row">
              <button className={`chip ${sortKey === "pick" ? "active" : ""}`} onClick={() => setSortKey("pick")}>pick order</button>
              <button className={`chip ${sortKey === "difficulty" ? "active" : ""}`} onClick={() => setSortKey("difficulty")}>difficulty</button>
            </div>
          </div>
          <div className="selection-table">
            {candidates.map((candidate) => (
              <SelectionRow key={candidate.task_id} runId={runId} candidate={candidate} />
            ))}
          </div>
        </>
      ) : null}
    </Page>
  );
}

function SelectionRow({ runId, candidate }: { runId: string; candidate: SelectionCandidate }) {
  return (
    <details className={`selection-row ${candidate.selected ? "selected" : ""}`}>
      <summary>
        <Link to={`/runs/${runId}/tasks/${candidate.task_id}`}>{candidate.task_id}</Link>
        <span>{formatFloat(candidate.difficulty_score)}</span>
        <StatusBadge value={candidate.selected ? "selected" : "candidate"} tone={candidate.selected ? "good" : "muted"} />
        <span>{candidate.dpp_pick ? `pick ${candidate.dpp_pick.step}` : "not picked"}</span>
        <span>{formatFloat(candidate.dpp_pick?.log_det_gain)}</span>
      </summary>
      <p>{candidate.fingerprint || "No fingerprint recorded."}</p>
    </details>
  );
}

function TaskJourneyPage() {
  const { runId = "", taskId = "" } = useParams();
  const { data, error, loading } = useJson<TaskDetail>(`/api/runs/${runId}/tasks/${taskId}`);
  const comparePair = useMemo(() => {
    const trajectories = data?.trajectories ?? [];
    for (let i = 0; i < trajectories.length; i += 1) {
      for (let j = i + 1; j < trajectories.length; j += 1) {
        if (trajectories[i].harness_id && trajectories[j].harness_id && trajectories[i].harness_id !== trajectories[j].harness_id) {
          return [trajectories[i], trajectories[j]];
        }
      }
    }
    return null;
  }, [data?.trajectories]);

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Runs", to: "/" }, { label: runId, to: `/runs/${runId}` }, { label: taskId }]} />
      {loading ? <Loading /> : null}
      {error ? <ErrorPanel error={error} /> : null}
      {data ? (
        <>
          <SectionHeader
            title={data.task_id}
            subtitle={data.selection ? `difficulty ${formatFloat(data.selection.difficulty_score)} · ${data.selection.selected ? "selected" : "candidate"}` : undefined}
          />
          {comparePair ? (
            <Link
              className="ghost-button fit-button"
              to={`/compare?left=${runId}/${comparePair[0].id}&right=${runId}/${comparePair[1].id}`}
            >
              Compare these two
            </Link>
          ) : null}
          <div className="journey-list">
            {data.trajectories.map((trajectory) => (
              <Link className="journey-row" key={trajectory.id} to={`/runs/${runId}/trajectories/${trajectory.id}`}>
                <div>
                  <div className="run-title">{trajectory.stage || "stage"}</div>
                  <div className="muted">{trajectory.id}</div>
                </div>
                <span>{trajectory.harness_id || "unknown harness"}</span>
                <span>{formatDuration(trajectory.wall_time_s)}</span>
                <ScoreBadge score={trajectory.score} />
              </Link>
            ))}
          </div>
          {data.diagnosis ? (
            <details className="details-block">
              <summary>Diagnosis</summary>
              <JsonBlock value={data.diagnosis} />
            </details>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}

function HarnessPage() {
  const { runId = "", harnessId = "" } = useParams();
  const { data, error, loading } = useJson<HarnessDetail>(`/api/runs/${runId}/harness/${harnessId}`);
  const [path, setPath] = useState<string | null>(null);
  const text = useText(path ? `/api/runs/${runId}/harness/${harnessId}/file/${encodePath(path)}` : null);
  return (
    <Page>
      <Breadcrumbs items={[{ label: "Runs", to: "/" }, { label: runId, to: `/runs/${runId}` }, { label: harnessId }]} />
      {loading ? <Loading /> : null}
      {error ? <ErrorPanel error={error} /> : null}
      {data ? (
        <>
          <SectionHeader title={data.harness_id} subtitle={`${data.files.length} harness files`} />
          <div className="split-layout">
            <section className="section">
              <div className="file-list">
                {data.files.map((entry) => (
                  <button className={`list-button ${path === entry.path ? "active" : ""}`} key={entry.path} onClick={() => setPath(entry.path)}>
                    <span>{entry.path}</span>
                    <span className="muted">{formatBytes(entry.size)}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="section">
              {path ? text.loading ? <Loading /> : text.error ? <ErrorPanel error={text.error} /> : <TextBlock text={text.text} /> : <EmptyState text="Pick a harness file." />}
            </section>
          </div>
        </>
      ) : null}
    </Page>
  );
}

function TrajectoryPage() {
  const { runId = "", trajId = "" } = useParams();

  return (
    <Page>
      <Breadcrumbs
        items={[
          { label: "Runs", to: "/" },
          { label: runId, to: `/runs/${runId}` },
          { label: trajId },
        ]}
      />
      <TrajectoryView runId={runId} trajId={trajId} />
    </Page>
  );
}

function ComparePage() {
  const params = new URLSearchParams(window.location.search);
  const left = parseTrajectoryRef(params.get("left"));
  const right = parseTrajectoryRef(params.get("right"));
  const leftScore = useJson<TrajectoryScore | null>(
    left ? `/api/runs/${left.runId}/trajectories/${left.trajId}/score` : "",
    !left,
  );
  const rightScore = useJson<TrajectoryScore | null>(
    right ? `/api/runs/${right.runId}/trajectories/${right.trajId}/score` : "",
    !right,
  );
  return (
    <Page>
      <Breadcrumbs items={[{ label: "Runs", to: "/" }, { label: "Compare" }]} />
      <SectionHeader title="Compare" subtitle="Two explicit run/trajectory references rendered with the shared transcript viewer." />
      {left && right ? (
        <>
          <div className="compare-scorebar">
            <div>
              <span className="muted">{left.runId}/{left.trajId}</span>
              <ScoreBadge score={leftScore.data ?? null} />
            </div>
            <div>
              <span className="muted">{right.runId}/{right.trajId}</span>
              <ScoreBadge score={rightScore.data ?? null} />
            </div>
            {leftScore.data?.kind === "ctrf" && rightScore.data?.kind === "ctrf" ? (
              <strong>delta {formatFloat((rightScore.data.score ?? 0) - (leftScore.data.score ?? 0))}</strong>
            ) : null}
          </div>
          <div className="compare-grid">
            <TrajectoryView runId={left.runId} trajId={left.trajId} compact />
            <TrajectoryView runId={right.runId} trajId={right.trajId} compact />
          </div>
        </>
      ) : (
        <EmptyState text="Provide left and right query params as run/trajectory." />
      )}
    </Page>
  );
}

function parseTrajectoryRef(value: string | null): { runId: string; trajId: string } | null {
  if (!value) {
    return null;
  }
  const [runId, trajId] = value.split("/");
  return runId && trajId ? { runId, trajId } : null;
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="page">{children}</div>;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-header">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="breadcrumbs">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {item.to ? <NavLink to={item.to}>{item.label}</NavLink> : item.label}
          {index < items.length - 1 ? " / " : ""}
        </span>
      ))}
    </nav>
  );
}

function MetricGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="metric-grid">
      {items.map((item) => (
        <div className="metric-card" key={item.label}>
          <div className="metric-value">{item.value}</div>
          <div className="metric-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`metric-inline ${compact ? "compact" : ""}`}>
      <span className="metric-inline-label">{label}</span>
      <span className="metric-inline-value">{value}</span>
    </div>
  );
}

function StatusBadge({ value, tone }: { value: string; tone: "good" | "warn" | "muted" | "accent" }) {
  return <span className={`status-badge ${tone}`}>{value}</span>;
}

function JsonBlock({ value, compact = false }: { value: unknown; compact?: boolean }) {
  return <pre className={`text-block mono ${compact ? "compact" : ""}`}>{JSON.stringify(value, null, 2)}</pre>;
}

function DiffBlock({ text }: { text: string }) {
  return (
    <pre className="text-block mono diff-block">
      {text.split("\n").map((line, index) => (
        <span className={`diff-line ${diffLineClass(line)}`} key={index}>
          {line || " "}
        </span>
      ))}
    </pre>
  );
}

function TextBlock({
  text,
  compact = false,
  truncated = false,
}: {
  text: string;
  compact?: boolean;
  truncated?: boolean;
}) {
  return (
    <div className={`text-block ${compact ? "compact" : ""}`}>
      <pre>{text || "(empty)"}</pre>
      {truncated ? <div className="muted">Preview truncated.</div> : null}
    </div>
  );
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

function useJson<T>(path: string, skip = false) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (skip) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<T>(path)
      .then((value) => {
        if (cancelled) {
          return;
        }
        setData(value);
      })
      .catch((reason) => {
        if (cancelled) {
          return;
        }
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, skip]);
  return { data, error, loading };
}

function useText(path: string | null) {
  const [text, setText] = useState<string>("");
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

function numberAt(value: Record<string, unknown>, path: string[]): number | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "number" ? current : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function formatFloat(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "n/a";
  }
  return value.toFixed(2);
}

function formatDuration(value: number | null | undefined) {
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

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "n/a";
  }
  return value.toLocaleString();
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

function arrayText(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : "n/a";
}

function diffLineClass(line: string) {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "add";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "del";
  }
  if (line.startsWith("@@")) {
    return "hunk";
  }
  return "ctx";
}
