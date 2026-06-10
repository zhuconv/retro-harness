export const meta = {
  name: 'retrospection',
  description: 'One retrospection cycle (RHO): mine past Claude Code sessions, diagnose failures, evolve CLAUDE.md / memory / helper scripts, pick the winner by self-preference, apply it',
  whenToUse: 'Run periodically in a project that has accumulated real Claude Code sessions. Evolves the project harness (CLAUDE.md, auto-memory, helper scripts) using only past trajectories — no ground-truth feedback needed. Based on "Evolving Agents in the Dark" (RHO, arXiv:2606.05922). Args (all optional): {projectDir, model, k, n, probes, maxSessions, theta, apply}.',
  phases: [
    { title: 'Bootstrap', detail: 'locate transcripts + current harness, create run dir' },
    { title: 'Digest', detail: 'parallel summaries of past sessions (difficulty + fingerprint)' },
    { title: 'Diagnose', detail: 'self-validation per session, self-consistency across similar sessions' },
    { title: 'Optimize', detail: 'N candidate harnesses from the merged diagnoses' },
    { title: 'Probe', detail: 're-solve probe tasks with each candidate (worktree-isolated)' },
    { title: 'Select & Apply', detail: 'self-preference scores, accept winner only if S > 0' },
  ],
}

// ---------------------------------------------------------------------------
// Config. Defaults keep the whole run under ~40 agent calls (hard goal: <100).
// Paper defaults were k=10, G=3 rollouts, N=3 candidates; here the historical
// transcripts replace the G rollouts, and probes replace full-coreset re-solve.
// ---------------------------------------------------------------------------
// args may arrive as a JSON-encoded string depending on the caller; normalize.
// (Object.assign with a string source silently spreads characters — never merge raw.)
let _args = args
if (typeof _args === 'string') {
  try { _args = JSON.parse(_args) } catch (e) { _args = {} }
}
const cfg = Object.assign(
  // projectDir: target project to evolve (default: this session's cwd).
  // model: model override for every spawned agent (default: inherit session model).
  { k: 8, n: 2, probes: 4, maxSessions: 36, batch: 3, theta: 0.7, apply: true, projectDir: null, model: null },
  _args && typeof _args === 'object' ? _args : {},
)
log(`config: ${JSON.stringify(cfg)}`)
const M = cfg.model ? { model: cfg.model } : {}
const PROJ = cfg.projectDir
  ? `The TARGET PROJECT is ${cfg.projectDir} — operate on that directory, NOT your current working directory.`
  : 'The target project is your current working directory.'

const BOOT_SCHEMA = {
  type: 'object',
  required: ['projectDir', 'transcriptsDir', 'memoryDir', 'runDir', 'sessions'],
  properties: {
    projectDir: { type: 'string' },
    transcriptsDir: { type: 'string' },
    memoryDir: { type: 'string' },
    runDir: { type: 'string' },
    isGitRepo: { type: 'boolean' },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file'],
        properties: {
          file: { type: 'string', description: 'absolute path to the session .jsonl' },
          sizeKb: { type: 'number' },
          mtime: { type: 'string' },
        },
      },
    },
  },
}

const DIGEST_SCHEMA = {
  type: 'object',
  required: ['sessions'],
  properties: {
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'taskSummary', 'difficulty', 'fingerprint', 'outcome'],
        properties: {
          file: { type: 'string' },
          taskSummary: { type: 'string', description: '1-2 sentences: what the user wanted' },
          query: { type: 'string', description: 'self-contained restatement of the task, runnable without this transcript' },
          difficulty: { type: 'number', description: '0-10, how much the agent struggled (retries, dead ends, user corrections)' },
          fingerprint: { type: 'array', items: { type: 'string' }, description: '5-10 lowercase keywords abstracting the task type, NOT specific filenames' },
          outcome: { type: 'string', enum: ['success', 'partial', 'failure', 'unclear'] },
          friction: { type: 'array', items: { type: 'string' }, description: 'concrete pain points: wrong assumptions, missing project knowledge, repeated manual steps, user corrections' },
          replayable: { type: 'boolean', description: 'true if the task could be meaningfully re-attempted in the current repo state' },
        },
      },
    },
  },
}

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  required: ['severity', 'failureModes', 'improvementDirection'],
  properties: {
    severity: { type: 'number', description: '0.0-1.0 soft attention weight for the optimizer' },
    validationIssues: { type: 'array', items: { type: 'string' }, description: 'per-session correctness concerns found by inspecting the trajectory' },
    failureModes: { type: 'string', description: 'why failures / friction happened; root causes' },
    inconsistency: { type: 'string', description: 'where similar sessions diverged and why (empty if single session)' },
    improvementDirection: { type: 'string', description: 'ONE high-level, task-agnostic direction for harness improvement' },
    probe: {
      type: 'object',
      required: ['replayable'],
      properties: {
        replayable: { type: 'boolean' },
        query: { type: 'string', description: 'self-contained probe task to re-attempt' },
        originalSession: { type: 'string', description: 'absolute path of the session jsonl to compare against' },
      },
    },
  },
}

const SCORE_SCHEMA = {
  type: 'object',
  required: ['value', 'rationale'],
  properties: {
    value: { type: 'number', description: 'integer in [-10, 10]; positive means trajectory A is better' },
    rationale: { type: 'string' },
  },
}

const APPLY_SCHEMA = {
  type: 'object',
  required: ['applied', 'summary'],
  properties: {
    applied: { type: 'boolean' },
    summary: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
  },
}

// How to find Claude Code transcripts — stated explicitly so the workflow does
// not depend on any skill being installed.
const TRANSCRIPT_HOWTO = `Claude Code stores one transcript per session at ~/.claude/projects/<slug>/<uuid>.jsonl, where <slug> is the project's absolute path with every "/" replaced by "-" (e.g. /Users/me/Repos/foo -> -Users-me-Repos-foo). The project's auto-memory lives in the same directory under memory/. Each .jsonl line is one event; the interesting ones have "type":"user" (user messages) and "type":"assistant" (assistant text + tool calls). Transcripts can be many MB — use jq/grep/python to extract, never read whole files raw.`

// ---------------------------------------------------------------------------
// Phase 1 — Bootstrap: one agent locates everything and snapshots the current
// harness h_0 into the run dir.
// ---------------------------------------------------------------------------
phase('Bootstrap')
const boot = await agent(
  `You are the bootstrap step of a harness-evolution workflow. ${PROJ}

${TRANSCRIPT_HOWTO}

Do the following, then return JSON:
1. Resolve the target project dir and its transcript dir under ~/.claude/projects/. Resolve the memory dir (<transcriptsDir>/memory/; create it if missing).
2. Create a run directory ~/.claude/rho-runs/<UTC timestamp>-<project basename>/ (mkdir -p). All workflow artifacts go there.
3. Snapshot the current harness h_0 into <runDir>/harness_0/: copy the project CLAUDE.md (if any) to harness_0/CLAUDE.md, copy the memory dir to harness_0/memory/, and write harness_0/scripts-inventory.md listing helper scripts referenced by CLAUDE.md or living in obvious helper locations (scripts/, bin/, .claude/). If there is no CLAUDE.md yet, create an empty harness_0/CLAUDE.md — evolving from an empty harness is fine.
4. List session transcripts: gather .jsonl files from the project's transcript dir AND from sibling dirs whose name starts with the project slug (e.g. <slug>--claude-worktrees-*; those are sessions run in Claude Code worktrees of the same project). Keep the ${cfg.maxSessions} largest, EXCLUDING files modified in the last 10 minutes (likely live sessions) and files under 5KB (trivial sessions). Report absolute path, size in KB, mtime for each.
5. Report whether the target project is a git repo (git -C <projectDir> rev-parse --is-inside-work-tree).
Never read or copy secret files (.env, credentials, keys).`,
  { label: 'bootstrap', schema: BOOT_SCHEMA, ...M },
)
if (!boot || !boot.sessions || boot.sessions.length === 0) {
  return { error: 'No usable session transcripts found — use Claude Code in this project for a while, then rerun.' }
}
const R = boot.runDir
log(`run dir: ${R}; ${boot.sessions.length} candidate sessions`)

// ---------------------------------------------------------------------------
// Phase 2 — Digest: parallel batch summarization (replaces the paper's LLM
// difficulty judge; difficulty + fingerprint feed the DPP-style selection).
// ---------------------------------------------------------------------------
phase('Digest')
const batches = []
for (let i = 0; i < boot.sessions.length; i += cfg.batch) {
  batches.push(boot.sessions.slice(i, i + cfg.batch))
}
const digestResults = await parallel(
  batches.map((batch, bi) => () =>
    agent(
      `You are digesting past Claude Code sessions for a harness-evolution workflow. ${PROJ}

${TRANSCRIPT_HOWTO}

Sessions to digest (read each, in full but efficiently — extract user messages, assistant final messages, tool errors, and signs of struggle):
${batch.map((s) => `- ${s.file}`).join('\n')}

For each session produce: a task summary, a self-contained query restatement, difficulty 0-10 (how much the agent struggled: dead ends, retries, user corrections, long error chains), a fingerprint of 5-10 abstract task-type keywords (lowercase; describe the KIND of work, not specific file names), outcome, concrete friction points, and whether the task is replayable in the current repo state (replayable = a fresh agent could meaningfully re-attempt it now; one-off Q&A about long-gone state is not).
Skip sessions that are empty or pure chit-chat by giving them difficulty 0.`,
      { label: `digest:batch${bi}`, schema: DIGEST_SCHEMA, ...M },
    )),
)
const digests = digestResults
  .filter(Boolean)
  .flatMap((r) => r.sessions)
  .filter((s) => s && s.difficulty > 0)
log(`${digests.length} sessions digested`)
if (digests.length === 0) return { error: 'All sessions digested as trivial; nothing to evolve from.', runDir: R }

// ---------------------------------------------------------------------------
// Coreset selection — plain-JS greedy MAP on L = diag(r) S diag(r), the same
// kernel shape as the paper's DPP (selection/dpp_selector.py), with a Jaccard
// fingerprint kernel instead of embedding cosine. theta in [0,1]: 0 = pure
// diversity, 1 = pure difficulty; alpha = theta / (2(1-theta)).
// ---------------------------------------------------------------------------
const alpha = cfg.theta / (2 * Math.max(1 - cfg.theta, 1e-6))
const r = digests.map((d) => Math.pow(Math.max(d.difficulty, 1) / 10, alpha))
const jaccard = (a, b) => {
  const A = new Set(a.map((x) => x.toLowerCase()))
  const B = new Set(b.map((x) => x.toLowerCase()))
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  const uni = A.size + B.size - inter
  return uni === 0 ? 0 : inter / uni
}
const picked = []
while (picked.length < Math.min(cfg.k, digests.length)) {
  let best = -1
  let bestGain = -Infinity
  for (let i = 0; i < digests.length; i++) {
    if (picked.includes(i)) continue
    // greedy MAP gain ~ quality^2 * residual diversity vs already-picked set
    const maxSim = picked.length
      ? Math.max(...picked.map((j) => jaccard(digests[i].fingerprint, digests[j].fingerprint)))
      : 0
    const gain = r[i] * r[i] * (1 - maxSim)
    if (gain > bestGain) { bestGain = gain; best = i }
  }
  if (best < 0) break
  picked.push(best)
}
const coreset = picked.map((i) => digests[i])
log(`coreset: ${coreset.length} sessions (theta=${cfg.theta})`)

// Group similar coreset sessions (Jaccard >= 0.4, groups of <= 3) so the
// diagnoser can recover the paper's self-consistency signal across sibling
// sessions; singletons get validation-only diagnosis (the paper's
// diagnosis-no-consistency ablation shows that leg stands on its own).
const groups = []
const used = new Set()
for (let i = 0; i < coreset.length; i++) {
  if (used.has(i)) continue
  const g = [coreset[i]]
  used.add(i)
  for (let j = i + 1; j < coreset.length && g.length < 3; j++) {
    if (!used.has(j) && jaccard(coreset[i].fingerprint, coreset[j].fingerprint) >= 0.4) {
      g.push(coreset[j])
      used.add(j)
    }
  }
  groups.push(g)
}

// ---------------------------------------------------------------------------
// Phase 3 — Diagnose: self-validation (+ self-consistency for groups >= 2).
// ---------------------------------------------------------------------------
phase('Diagnose')
const diagnoses = (await parallel(
  groups.map((g, gi) => () =>
    agent(
      `You are the diagnoser in a harness-evolution workflow. ${PROJ} The "harness" is everything persistent that shapes future Claude Code sessions in the target project: CLAUDE.md, the auto-memory directory, and helper scripts. The current harness snapshot is at ${R}/harness_0/.

${TRANSCRIPT_HOWTO}

Analyze ${g.length} past session(s) on similar task types:
${g.map((d) => `- ${d.file}\n  summary: ${d.taskSummary}\n  outcome: ${d.outcome}; friction: ${(d.friction || []).join('; ') || 'none noted'}`).join('\n')}

Steps:
1. SELF-VALIDATION (per session): read the transcript and judge from internal evidence whether the final result was actually correct/complete — wrong assumptions, skipped verification, premature stops, errors papered over.
${g.length >= 2 ? '2. SELF-CONSISTENCY (across sessions): these sessions are similar task types — identify consequential divergences in approach, tool sequence, or conclusions, and what knowledge would have prevented them.' : '2. SELF-CONSISTENCY: only one session in this group — leave inconsistency empty.'}
3. Derive ONE high-level improvement direction for the harness. It must be TASK-AGNOSTIC: a reusable rule, a fact worth persisting in memory, or a helper script worth adding — not a patch for this exact task instance.
4. Set severity 0.0-1.0 (recurring, costly failure modes high; cosmetic friction low).
5. Decide a probe: if any of these tasks is replayable in the target project's current state, set probe.replayable=true, give a self-contained probe.query and probe.originalSession (the jsonl path of the session it replays). Prefer probes a fresh agent can finish in well under an hour; verification-style tasks (build, run, reproduce, inspect) also count.
6. Write your full analysis as markdown to ${R}/diagnoses/group_${gi}.md (mkdir -p first).`,
      { label: `diagnose:g${gi}`, schema: DIAGNOSIS_SCHEMA, ...M },
    )),
)).filter(Boolean)
if (diagnoses.length === 0) return { error: 'All diagnose agents failed.', runDir: R }
const ranked = diagnoses.slice().sort((a, b) => b.severity - a.severity)
log(`${diagnoses.length} diagnoses; top severity ${ranked[0].severity}`)

// ---------------------------------------------------------------------------
// Phase 4 — Optimize: N candidates, each written to its own staging dir under
// the run dir (outside the repo, so parallel writers cannot conflict).
// ---------------------------------------------------------------------------
phase('Optimize')
const candidates = (await parallel(
  Array.from({ length: cfg.n }, (_, j) => () =>
    agent(
      `You are the harness optimizer (sample ${j + 1} of ${cfg.n} — independent attempt; take your own angle on the diagnoses).

Current harness h_0: ${R}/harness_0/ (CLAUDE.md, memory/, scripts-inventory.md). Diagnoses: ${R}/diagnoses/*.md, with severities as soft attention weights:
${ranked.map((d, i) => `- [severity ${d.severity}] ${d.improvementDirection}`).join('\n')}

Build an improved FULL candidate harness at ${R}/candidate_${j}/:
- candidate_${j}/CLAUDE.md — complete evolved file (start from h_0's copy; surgical edits, no bloat: CLAUDE.md is loaded into every future session, so each line must earn its context cost)
- candidate_${j}/memory/ — complete evolved memory dir (one fact per file with name/description frontmatter; update or prune stale files; add facts the diagnoses show were missing). If h_0 has a memory/MEMORY.md index, keep it consistent.
- candidate_${j}/scripts/ — new or improved helper scripts, if any diagnosis calls for a repeatable procedure; each script's header comment states its intended destination path in the project
- candidate_${j}/CHANGES.md — what changed and why, mapped to diagnoses

Rules: keep everything TASK-AGNOSTIC (rules and knowledge that transfer to future tasks, not patches for past task instances). Prioritize high-severity recurring failure modes and inconsistency root causes. Prefer memory files for facts, CLAUDE.md for behavioral rules, scripts for repeatable procedures. ${PROJ} You may READ the target project for context, but do NOT touch any real project files — write only under ${R}/candidate_${j}/.`,
      { label: `optimize:${j}`, phase: 'Optimize', ...M },
    ).then((msg) => (msg ? { j, msg } : null))),
)).filter(Boolean)
if (candidates.length === 0) return { error: 'All optimize agents failed.', runDir: R }

// ---------------------------------------------------------------------------
// Phase 5 — Probe: pick up to cfg.probes replayable tasks (highest severity
// first), re-solve each with every candidate harness in an isolated copy of
// the TARGET project (the agent makes the copy itself: git worktree if the
// target is a repo, else cp — note the built-in isolation:'worktree' option
// would isolate the wrong repo when projectDir != cwd), then score new-vs-old
// by self-preference. pipeline() so each (candidate, task) pair flows
// solve -> evaluate independently, no barrier.
// ---------------------------------------------------------------------------
phase('Probe')
const probeTasks = ranked
  .filter((d) => d.probe && d.probe.replayable && d.probe.query)
  .slice(0, cfg.probes)
let scoresByCandidate
if (probeTasks.length > 0) {
  const pairs = []
  for (const c of candidates) {
    for (let t = 0; t < probeTasks.length; t++) pairs.push({ j: c.j, t })
  }
  const pairResults = await pipeline(
    pairs,
    (p) =>
      agent(
        `You are re-attempting a past task in the project at ${boot.projectDir}.

FIRST, create an isolated copy so the user's real tree is never touched: if ${boot.projectDir} is a git repo, run \`git -C ${boot.projectDir} worktree add --detach ${R}/wt/c${p.j}t${p.t}\`; otherwise \`cp -R ${boot.projectDir} ${R}/wt/c${p.j}t${p.t}\` (mkdir -p ${R}/wt first). Then work ONLY inside that copy. Never modify ${boot.projectDir} itself.

IMPORTANT: ignore the project's own CLAUDE.md for this run. Your project instructions are the candidate harness at ${R}/candidate_${p.j}/ — read its CLAUDE.md and memory/ first and follow them; its scripts/ are available helpers.

Task: ${probeTasks[p.t].probe.query}

Do the work end-to-end inside the copy. Then write a concise account of what you did, key decisions, and the final result to ${R}/probe/cand_${p.j}_task_${p.t}.md, and return that same account as your final message.`,
        { label: `solve:c${p.j}t${p.t}`, phase: 'Probe', ...M },
      ),
    (attempt, p) =>
      attempt == null
        ? null
        : agent(
            `You are a strict pairwise judge in a harness-evolution workflow. Compare two attempts at the same task and return an integer score in [-10, 10]: positive iff trajectory A is better, magnitude = how decisive.

Task: ${probeTasks[p.t].probe.query}

Trajectory A (fresh attempt): read ${R}/probe/cand_${p.j}_task_${p.t}.md
Trajectory B (past session): ${probeTasks[p.t].probe.originalSession}
${TRANSCRIPT_HOWTO}

Judge PROCESS QUALITY, not surface polish: correct approach, fewer dead ends and wrong assumptions, verification of the result, efficient use of project knowledge. The repo may have evolved since trajectory B — do not penalize either side for state drift; compare how each handled the task it faced. Be skeptical of A: confident-sounding but unverified work scores negative.`,
            { label: `eval:c${p.j}t${p.t}`, phase: 'Probe', schema: SCORE_SCHEMA, ...M },
          ).then((s) => (s ? { j: p.j, value: s.value, rationale: s.rationale } : null)),
  )
  const flat = pairResults.filter(Boolean)
  scoresByCandidate = candidates.map((c) => {
    const mine = flat.filter((s) => s.j === c.j)
    return {
      j: c.j,
      n: mine.length,
      mean: mine.length ? mine.reduce((a, s) => a + s.value, 0) / mine.length : -Infinity,
      rationales: mine.map((s) => s.rationale),
    }
  })
} else {
  // Fallback (no replayable probes): judge each candidate harness directly
  // against h_0 in light of the diagnoses. Weaker signal than
  // trajectory-level self-preference; flagged in the report.
  log('no replayable probes — falling back to harness-level preference judging')
  scoresByCandidate = (await parallel(
    candidates.map((c) => () =>
      agent(
        `Pairwise-judge two harnesses for the project at ${boot.projectDir} against the diagnosed failure modes (${R}/diagnoses/*.md). Harness A: ${R}/candidate_${c.j}/. Harness B (current): ${R}/harness_0/. Return integer in [-10, 10], positive iff A would prevent the diagnosed failures better WITHOUT bloating context or overfitting to past task instances. Penalize task-specific patches and CLAUDE.md bloat harshly.`,
        { label: `judge:c${c.j}`, phase: 'Probe', schema: SCORE_SCHEMA, ...M },
      ).then((s) => (s ? { j: c.j, n: 1, mean: s.value, rationales: [s.rationale] } : null))),
  )).filter(Boolean)
}

// ---------------------------------------------------------------------------
// Phase 6 — Select winner (argmax over mean score), accept only if S > 0,
// apply with backup. Mirrors loop.py's aggregation exactly.
// ---------------------------------------------------------------------------
phase('Select & Apply')
const validScores = scoresByCandidate.filter((s) => s && s.n > 0)
if (validScores.length === 0) return { error: 'No candidate received any score.', runDir: R }
const winner = validScores.reduce((a, b) => (b.mean > a.mean ? b : a))
const accepted = winner.mean > 0
log(`scores: ${validScores.map((s) => `c${s.j}=${s.mean.toFixed(2)}(n=${s.n})`).join(', ')} -> ${accepted ? `accept c${winner.j}` : 'reject all (keep h_0)'}`)

const report = await agent(
  `You are the final step of a harness-evolution run. Run dir: ${R}.

Decision: candidate_${winner.j} won with mean self-preference score ${winner.mean.toFixed(2)} over ${winner.n} comparison(s); acceptance rule is mean > 0, so the update is ${accepted ? 'ACCEPTED' : 'REJECTED'}. All scores: ${JSON.stringify(validScores.map((s) => ({ candidate: s.j, mean: s.mean, n: s.n })))}.

1. Write ${R}/report.md: what was diagnosed (summarize ${R}/diagnoses/), what each candidate changed (their CHANGES.md), the scores with judge rationales (${JSON.stringify(winner.rationales).slice(0, 2000)}), and the decision.
${accepted && cfg.apply
    ? `2. APPLY candidate_${winner.j} to the live harness of the project at ${boot.projectDir}, with backup first:
   - back up ${boot.projectDir}/CLAUDE.md and ${boot.memoryDir} to ${R}/backup/
   - copy ${R}/candidate_${winner.j}/CLAUDE.md to ${boot.projectDir}/CLAUDE.md
   - sync ${R}/candidate_${winner.j}/memory/ into ${boot.memoryDir} (overwrite changed files, add new ones, delete only files the CHANGES.md explicitly prunes)
   - install candidate_${winner.j}/scripts/* to the destination paths stated in each script's header, relative to ${boot.projectDir} (create dirs as needed; chmod +x shell scripts)
   - if probe worktrees exist under ${R}/wt/, clean them up: \`git -C ${boot.projectDir} worktree remove --force <each>\` (or rm -rf for plain copies)
   - list every file you changed`
    : '2. Do NOT modify any live files — the update was rejected or apply=false. Note in the report that the candidate remains staged in the run dir for manual review.'}
3. Return JSON: applied (boolean), summary (3-6 sentences for the user: what the harness learned this cycle and the evidence), changedFiles.`,
  { label: 'apply', schema: APPLY_SCHEMA, ...M },
)

return {
  runDir: R,
  coresetSize: coreset.length,
  diagnoses: ranked.map((d) => ({ severity: d.severity, direction: d.improvementDirection })),
  scores: validScores.map((s) => ({ candidate: s.j, mean: s.mean, n: s.n })),
  winner: winner.j,
  accepted,
  applied: report ? report.applied : false,
  summary: report ? report.summary : 'apply/report agent failed — inspect the run dir manually',
}
