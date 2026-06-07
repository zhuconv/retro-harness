export type RunSummary = {
  id: string;
  name: string;
  dataset_spec?: string;
  round_count: number;
  trajectory_count: number;
  trajectory_counts_by_kind: Record<string, number>;
  trajectory_counts_by_stage: Record<string, number>;
  final_val?: { mean_score?: number; n?: number };
  initial_harness_id?: string;
  final_harness_id?: string;
  end_timestamp?: string;
  usage?: Record<string, number>;
};

export type RunDetail = {
  id: string;
  name: string;
  path: string;
  config: Record<string, unknown>;
  environment: Record<string, unknown>;
  summary: Record<string, unknown>;
  manifest: {
    trajectory_count: number;
    trajectory_counts_by_kind: Record<string, number>;
    trajectory_counts_by_stage: Record<string, number>;
    generated_fallback?: boolean;
  };
  usage_summary: {
    overall: Record<string, number>;
    by_kind: Record<string, Record<string, number>>;
    by_stage: Record<string, Record<string, number>>;
    generated_fallback?: boolean;
  };
  reports: { name: string; size: number }[];
  rounds: RoundSummary[];
  trajectories: TrajectorySummary[];
  selection_present?: boolean;
  selection_summary?: { selector?: string; k?: number; candidate_count?: number } | null;
};

export type RoundSummary = {
  round_ix: number;
  input_harness_id?: string | null;
  candidate_harness_id?: string | null;
  accepted?: boolean | null;
  mean_score?: number | null;
  score_count?: number;
  optimize_samples?: number;
  unique_candidate_count?: number;
  winner_sample_index?: number | null;
};

export type TrajectorySummary = {
  id: string;
  kind?: string;
  task_id?: string;
  harness_id?: string;
  stage?: string;
  round_ix?: number | null;
  sample_index?: number | null;
  exit_code?: number | null;
  timed_out?: boolean;
  wall_time_s?: number | null;
  model?: string | null;
  cache_mode?: string | null;
  missing?: boolean;
  score?: TrajectoryScore;
};

export type RoundDetail = {
  round_ix: number;
  input_harness_id?: string | null;
  candidate_harness_id?: string | null;
  accepted?: boolean | null;
  mean_score?: number | null;
  optimize_candidates: Record<string, unknown>;
  diagnoses: Record<string, unknown>[];
  scores: Record<string, unknown>[];
  solve_before: TrajectorySummary[][];
  diagnose_trajectories: TrajectorySummary[];
  optimize_trajectory: TrajectorySummary | null;
  optimize_trajectories: TrajectorySummary[];
  solve_after_trajectories: TrajectorySummary[];
  evaluate_trajectories: TrajectorySummary[];
  candidate_harness_diff: string;
};

export type TrajectoryDetail = {
  id: string;
  run_id: string;
  meta: Record<string, unknown>;
  score: TrajectoryScore;
  instructions_excerpt: string;
  instructions_size: number;
  final_message_size: number;
  stdout_size: number;
  stderr_size: number;
  events_size: number;
  workspace_diff_files: { path: string; size: number }[];
};

export type TrajectoryScore = {
  kind: "ctrf" | "consistency" | "ungraded";
  score: number | null;
  ctrf: { total: number; passed: number; failed: number; names: string[] } | null;
  reward: string | null;
  rationale: string | null;
  source: string;
};

export type TaskSummary = {
  task_id: string;
  trajectory_count: number;
  stages: string[];
};

export type TaskDetail = {
  task_id: string;
  trajectories: TrajectorySummary[];
  diagnosis: Record<string, unknown> | null;
  selection: { difficulty_score?: number | null; fingerprint?: string | null; selected: boolean } | null;
};

export type SelectionCandidate = {
  task_id: string;
  difficulty_score?: number | null;
  fingerprint?: string | null;
  selected: boolean;
  dpp_pick: { step?: number | null; log_det_gain?: number | null; score?: number | null } | null;
};

export type SelectionDetail = {
  selector?: string | null;
  k?: number | null;
  seed?: number | null;
  theta?: number | null;
  candidates: SelectionCandidate[];
  selected_task_ids: string[];
};

export type HarnessDetail = {
  harness_id: string;
  files: { path: string; size: number }[];
};

export type TracePayload = {
  summary: {
    step_count: number;
    event_count: number;
    counts_by_kind: Record<string, number>;
    command_count: number;
    failed_command_count: number;
    stderr_count: number;
    usage: Record<string, number>;
  };
  steps: TraceStep[];
};

export type TraceStep = {
  id: string;
  index: number;
  kind: string;
  status: string;
  title: string;
  subtitle: string;
  summary: string;
  metrics: Record<string, number | string | boolean | null>;
  preview:
    | {
        mode: "text";
        lines: string[];
        truncated: boolean;
      }
    | {
        mode: "todo";
        items: { text: string; completed: boolean }[];
      }
    | {
        mode: "file_change";
        paths: { path: string; kind: string }[];
        truncated: boolean;
      }
    | {
        mode: "queries";
        query: string;
        queries: string[];
        truncated: boolean;
      }
    | {
        mode: "search_matches";
        groups: { path: string; count: number; snippets: string[] }[];
        truncated: boolean;
      }
    | {
        mode: "file_list";
        groups: { name: string; count: number; sample: string[] }[];
        truncated: boolean;
      }
    | {
        mode: "json";
        value: unknown;
      }
    | null;
  raw_available: boolean;
  text?: string;
};

export type TraceChunk = {
  step_id: string;
  start_line: number;
  end_line: number;
  total_lines: number;
  has_more: boolean;
  lines: string[];
};

async function expectOk(response: Response): Promise<Response> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return response;
}

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await expectOk(await fetch(path));
  return (await response.json()) as T;
}

export async function fetchText(path: string): Promise<string> {
  const response = await expectOk(await fetch(path));
  return response.text();
}
