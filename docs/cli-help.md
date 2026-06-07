wrote docs/cli-help.md
scripts/gen-cli-help.sh — do not edit -->

# rho CLI reference

```
usage: rho [-h]
           {evolve,solve,grade,inspect,select,reasoningbank,meta-harness,ui,tb2-cleanup}
           ...

positional arguments:
  {evolve,solve,grade,inspect,select,reasoningbank,meta-harness,ui,tb2-cleanup}
    reasoningbank       Run the ReasoningBank baseline on train, then evaluate
                        frozen or online.
    meta-harness        Run the Meta-Harness baseline: filesystem-history
                        harness search with ground-truth scoring.
    tb2-cleanup         Remove orphaned TB2 containers

options:
  -h, --help            show this help message and exit
```

## evolve

```
usage: rho evolve [-h] --dataset DATASET --rounds ROUNDS [--run-dir RUN_DIR]
                  [--max-evolve-tasks MAX_EVOLVE_TASKS]
                  [--max-grading-tasks MAX_GRADING_TASKS]
                  [--optimize-samples OPTIMIZE_SAMPLES]
                  [--optimize-strategy {query-only,trajectory,diagnosis,diagnosis-no-consistency,diagnosis-no-validation,letta-sleep,dynamic-cheatsheet}]
                  [--optimize-trajectories-per-task OPTIMIZE_TRAJECTORIES_PER_TASK]
                  [--initial-harness INITIAL_HARNESS]
                  [--task-filter TASK_FILTER] [--seed SEED]
                  [--max-per-split MAX_PER_SPLIT]
                  [--grade-workers GRADE_WORKERS]
                  [--codex-concurrency CODEX_CONCURRENCY]
                  [--docker-pull {missing,always,never}]
                  [--difficulty DIFFICULTY] [--model MODEL]
                  [--reasoning-effort {minimal,low,medium,high,xhigh}]
                  [--cache {on,off,readonly,refresh}] [--cache-dir CACHE_DIR]
                  [--selector {random,difficulty,coverage,dpp}]
                  [--selection-json SELECTION_JSON] [--theta THETA]
                  [--codex-config CODEX_CONFIG] [--judge-model JUDGE_MODEL]
                  [--selector-reasoning-effort {minimal,low,medium,high,xhigh}]

options:
  -h, --help            show this help message and exit
  --dataset DATASET
  --rounds ROUNDS
  --run-dir RUN_DIR     Output directory. Default: runs/<timestamp>-<dataset>/
  --max-evolve-tasks MAX_EVOLVE_TASKS
                        Max train tasks per evolution round
                        (solve/optimize/evaluate). Default: all.
  --max-grading-tasks MAX_GRADING_TASKS
                        Max val tasks for post-evolution grading. 0 to skip
                        val grading. Default: all.
  --optimize-samples OPTIMIZE_SAMPLES
                        How many parallel optimize samples to run per round.
                        Default: 3.
  --optimize-strategy {query-only,trajectory,diagnosis,diagnosis-no-consistency,diagnosis-no-validation,letta-sleep,dynamic-cheatsheet}
                        Optimize strategy. Default: diagnosis. Choices:
                        ['query-only', 'trajectory', 'diagnosis', 'diagnosis-
                        no-consistency', 'diagnosis-no-validation', 'letta-
                        sleep', 'dynamic-cheatsheet'].
  --optimize-trajectories-per-task OPTIMIZE_TRAJECTORIES_PER_TASK
                        For --optimize-strategy=trajectory: how many solve
                        trajectories per task to show the optimize agent
                        (1..3). Default: 3.
  --initial-harness INITIAL_HARNESS
                        Harness directory path or ID in the run's store to
                        start from. Default: dataset built-in harness.
  --task-filter TASK_FILTER
                        Only include train tasks whose ID contains this
                        substring.
  --seed SEED           Random seed for train task sampling order. Does not
                        affect model or dataset split randomness. Default: no
                        shuffle.
  --max-per-split MAX_PER_SPLIT
                        Cap tasks per dataset split (train/val/test). Default:
                        all.
  --grade-workers GRADE_WORKERS
                        Max concurrent dataset grade() calls. Codex solve
                        submission is limited by --codex-concurrency. Default:
                        1.
  --codex-concurrency CODEX_CONCURRENCY
                        Max concurrent codex exec subprocesses in this Python
                        process. Default: 30.
  --docker-pull {missing,always,never}
                        Docker image pull policy for datasets that grade in
                        Docker. Default: missing.
  --difficulty DIFFICULTY
                        Comma-separated difficulty filter
                        (easy,medium,hard,extreme). Only honored by TB2
                        dataset.
  --model MODEL         Codex model to use. Default: gpt-5.5.
  --reasoning-effort {minimal,low,medium,high,xhigh}
                        Codex model reasoning effort via
                        model_reasoning_effort. Default: high.
  --cache {on,off,readonly,refresh}
                        Agent response cache mode. Default: off.
  --cache-dir CACHE_DIR
                        Agent response cache directory when cache is enabled.
                        Default: <run-dir>/agent-cache.
  --selector {random,difficulty,coverage,dpp}
                        Task selection strategy. Default: random. Choices:
                        ['random', 'difficulty', 'coverage', 'dpp'].
  --selection-json SELECTION_JSON
                        Reuse selected_task_ids from an existing
                        selection.json instead of running a selector.
  --theta THETA         DPP tradeoff parameter in [0, 1]. 0 = pure diversity,
                        1 = pure difficulty. Only used with --selector dpp.
                        Default: 0.7.
  --codex-config CODEX_CONFIG
                        Path to a codex config.toml. Copied verbatim into the
                        isolated CODEX_HOME for every agent run. Default:
                        configs/codex.azure-foundry.toml (hits Azure OpenAI Foundry
                        directly with an Entra Bearer refreshed by `az account
                        get-access-token`). See configs/ for alternatives.
  --judge-model JUDGE_MODEL
                        Selector judge model. Default: openai/gpt-5.5.
  --selector-reasoning-effort {minimal,low,medium,high,xhigh}
                        Selector judge reasoning effort. Default: high.
```

## solve

```
usage: rho solve [-h] --dataset DATASET --task TASK --harness HARNESS
                 --run-dir RUN_DIR [--model MODEL]
                 [--reasoning-effort {minimal,low,medium,high,xhigh}]
                 [--cache {on,off,readonly,refresh}] [--cache-dir CACHE_DIR]
                 [--codex-concurrency CODEX_CONCURRENCY]
                 [--docker-pull {missing,always,never}]
                 [--difficulty DIFFICULTY] [--codex-config CODEX_CONFIG]

options:
  -h, --help            show this help message and exit
  --dataset DATASET
  --task TASK
  --harness HARNESS
  --run-dir RUN_DIR
  --model MODEL         Codex model to use. Default: gpt-5.5.
  --reasoning-effort {minimal,low,medium,high,xhigh}
                        Codex model reasoning effort via
                        model_reasoning_effort. Default: high.
  --cache {on,off,readonly,refresh}
                        Agent response cache mode. Default: off.
  --cache-dir CACHE_DIR
                        Agent response cache directory when cache is enabled.
                        Default: <run-dir>/agent-cache.
  --codex-concurrency CODEX_CONCURRENCY
                        Max concurrent codex exec subprocesses in this Python
                        process. Default: 30.
  --docker-pull {missing,always,never}
                        Docker image pull policy for datasets that grade in
                        Docker. Default: missing.
  --difficulty DIFFICULTY
                        Comma-separated difficulty filter
                        (easy,medium,hard,extreme). Only honored by TB2
                        dataset.
  --codex-config CODEX_CONFIG
                        Path to a codex config.toml. Copied verbatim into the
                        isolated CODEX_HOME for every agent run. Default:
                        configs/codex.azure-foundry.toml (hits Azure OpenAI Foundry
                        directly with an Entra Bearer refreshed by `az account
                        get-access-token`). See configs/ for alternatives.
```

## grade

```
usage: rho grade [-h] --dataset DATASET --split {train,val,test} --harness
                 HARNESS --run-dir RUN_DIR
                 [--max-grading-tasks MAX_GRADING_TASKS]
                 [--grade-workers GRADE_WORKERS]
                 [--codex-concurrency CODEX_CONCURRENCY]
                 [--docker-pull {missing,always,never}] [--model MODEL]
                 [--reasoning-effort {minimal,low,medium,high,xhigh}]
                 [--cache {on,off,readonly,refresh}] [--cache-dir CACHE_DIR]
                 [--difficulty DIFFICULTY] [--codex-config CODEX_CONFIG]

options:
  -h, --help            show this help message and exit
  --dataset DATASET
  --split {train,val,test}
  --harness HARNESS
  --run-dir RUN_DIR
  --max-grading-tasks MAX_GRADING_TASKS
                        Max tasks to grade. Default: all.
  --grade-workers GRADE_WORKERS
                        Max concurrent dataset grade() calls. Codex solve
                        submission is limited by --codex-concurrency. Default:
                        1.
  --codex-concurrency CODEX_CONCURRENCY
                        Max concurrent codex exec subprocesses in this Python
                        process. Default: 30.
  --docker-pull {missing,always,never}
                        Docker image pull policy for datasets that grade in
                        Docker. Default: missing.
  --model MODEL         Codex model to use. Default: gpt-5.5.
  --reasoning-effort {minimal,low,medium,high,xhigh}
                        Codex model reasoning effort via
                        model_reasoning_effort. Default: high.
  --cache {on,off,readonly,refresh}
                        Agent response cache mode. Default: off.
  --cache-dir CACHE_DIR
                        Agent response cache directory when cache is enabled.
                        Default: <run-dir>/agent-cache.
  --difficulty DIFFICULTY
                        Comma-separated difficulty filter
                        (easy,medium,hard,extreme). Only honored by TB2
                        dataset.
  --codex-config CODEX_CONFIG
                        Path to a codex config.toml. Copied verbatim into the
                        isolated CODEX_HOME for every agent run. Default:
                        configs/codex.azure-foundry.toml (hits Azure OpenAI Foundry
                        directly with an Entra Bearer refreshed by `az account
                        get-access-token`). See configs/ for alternatives.
```

## inspect

```
usage: rho inspect [-h] --run-dir RUN_DIR --round ROUND

options:
  -h, --help         show this help message and exit
  --run-dir RUN_DIR
  --round ROUND
```

## select

```
usage: rho select [-h] --dataset DATASET --selector
                  {random,difficulty,coverage,dpp} [-k K]
                  [--split {train,val,test}] [--seed SEED]
                  [--task-filter TASK_FILTER] [--max-per-split MAX_PER_SPLIT]
                  [--run-dir RUN_DIR] [--docker-pull {missing,always,never}]
                  [--judge-model JUDGE_MODEL]
                  [--selector-reasoning-effort {minimal,low,medium,high,xhigh}]
                  [--model MODEL]
                  [--reasoning-effort {minimal,low,medium,high,xhigh}]
                  [--initial-harness INITIAL_HARNESS]
                  [--codex-config CODEX_CONFIG]
                  [--codex-concurrency CODEX_CONCURRENCY]
                  [--cache {on,off,readonly,refresh}] [--cache-dir CACHE_DIR]
                  [--embedding-model EMBEDDING_MODEL] [--theta THETA]
                  [--no-cache]

options:
  -h, --help            show this help message and exit
  --dataset DATASET
  --selector {random,difficulty,coverage,dpp}
                        Task selection strategy. Choices: ['random',
                        'difficulty', 'coverage', 'dpp'].
  -k K                  Number of tasks to pick. Required for
                        difficulty/coverage; default 'all' for random.
  --split {train,val,test}
                        Dataset split to select from. Default: train.
  --seed SEED
  --task-filter TASK_FILTER
  --max-per-split MAX_PER_SPLIT
                        Cap tasks loaded per split. Default: all.
  --run-dir RUN_DIR
  --docker-pull {missing,always,never}
  --judge-model JUDGE_MODEL
  --selector-reasoning-effort {minimal,low,medium,high,xhigh}
                        Selector judge reasoning effort. Default: high.
  --model MODEL         Codex solver model for short-solve probe. Default:
                        gpt-5.5.
  --reasoning-effort {minimal,low,medium,high,xhigh}
                        Codex solver reasoning effort for short-solve.
                        Default: high.
  --initial-harness INITIAL_HARNESS
                        Path or ID of the harness used for short-solve probe.
                        Default: first task's dataset-built-in harness.
  --codex-config CODEX_CONFIG
                        Path to a codex config.toml. Copied verbatim into the
                        isolated CODEX_HOME for every agent run. Default:
                        configs/codex.azure-foundry.toml (hits Azure OpenAI Foundry
                        directly with an Entra Bearer refreshed by `az account
                        get-access-token`). See configs/ for alternatives.
  --codex-concurrency CODEX_CONCURRENCY
                        Max concurrent codex exec subprocesses in this Python
                        process. Default: 30.
  --cache {on,off,readonly,refresh}
                        Agent response cache mode. Default: off.
  --cache-dir CACHE_DIR
                        Agent response cache directory. Default: <run-
                        dir>/agent-cache.
  --embedding-model EMBEDDING_MODEL
  --theta THETA         DPP tradeoff parameter in [0, 1]. 0 = pure diversity,
                        1 = pure difficulty. Only used with --selector dpp.
                        Default: 0.7.
  --no-cache            Bypass the on-disk selector cache (always call the
                        API). Note: this is the selection cache (data/cache/),
                        not the agent cache used by --cache in
                        evolve/solve/grade.
```

## reasoningbank

```
usage: rho reasoningbank [-h] --dataset DATASET [--run-dir RUN_DIR]
                         [--max-train-tasks MAX_TRAIN_TASKS]
                         [--max-grading-tasks MAX_GRADING_TASKS]
                         [--selector {random,difficulty,coverage,dpp}]
                         [--selection-json SELECTION_JSON] [--seed SEED]
                         [--task-filter TASK_FILTER]
                         [--max-per-split MAX_PER_SPLIT] [--theta THETA]
                         [--eval-variant {frozen,online}]
                         [--memory-n MEMORY_N] [--model MODEL]
                         [--reasoning-effort {minimal,low,medium,high,xhigh}]
                         [--judge-model JUDGE_MODEL]
                         [--selector-reasoning-effort {minimal,low,medium,high,xhigh}]
                         [--initial-harness INITIAL_HARNESS]
                         [--memory-model MEMORY_MODEL]
                         [--memory-reasoning-effort {minimal,low,medium,high,xhigh}]
                         [--embedding-provider {official-gemini,litellm}]
                         [--embedding-model EMBEDDING_MODEL]
                         [--grade-workers GRADE_WORKERS]
                         [--codex-concurrency CODEX_CONCURRENCY]
                         [--docker-pull {missing,always,never}]
                         [--difficulty DIFFICULTY]
                         [--cache {on,off,readonly,refresh}]
                         [--cache-dir CACHE_DIR] [--codex-config CODEX_CONFIG]

options:
  -h, --help            show this help message and exit
  --dataset DATASET
  --run-dir RUN_DIR     Output directory. Default:
                        runs/<timestamp>-reasoningbank-<dataset>/.
  --max-train-tasks MAX_TRAIN_TASKS
                        Max selected train tasks for the memory stream.
                        Default: all selected tasks.
  --max-grading-tasks MAX_GRADING_TASKS
                        Max val tasks to evaluate. 0 skips val evaluation.
                        Default: all.
  --selector {random,difficulty,coverage,dpp}
                        Train task selection strategy. Default: random.
                        Choices: ['random', 'difficulty', 'coverage', 'dpp'].
  --selection-json SELECTION_JSON
                        Reuse selected_task_ids from an existing
                        selection.json instead of running a selector.
  --seed SEED
  --task-filter TASK_FILTER
  --max-per-split MAX_PER_SPLIT
                        Cap tasks per dataset split before selection/eval.
                        Default: all.
  --theta THETA         DPP theta in [0, 1]. Default: 0.7.
  --eval-variant {frozen,online}
                        Frozen keeps train memory fixed during val; online
                        updates through val. Default: frozen.
  --memory-n MEMORY_N   Number of retrieved ReasoningBank entries per task.
                        Default: 1.
  --model MODEL         Codex solver model to use. Default: gpt-5.5.
  --reasoning-effort {minimal,low,medium,high,xhigh}
                        Codex solver reasoning effort. Default: high.
  --judge-model JUDGE_MODEL
                        Selector judge model. Default: openai/gpt-5.5.
  --selector-reasoning-effort {minimal,low,medium,high,xhigh}
                        Selector judge reasoning effort. Default: high.
  --initial-harness INITIAL_HARNESS
                        Path or ID of the harness used for short-solve probe.
                        Default: first task's dataset-built-in harness.
  --memory-model MEMORY_MODEL
                        ReasoningBank judge/extraction model. Default: openai/
                        form of --model.
  --memory-reasoning-effort {minimal,low,medium,high,xhigh}
                        ReasoningBank judge/extraction reasoning effort.
                        Default: high.
  --embedding-provider {official-gemini,litellm}
                        Retrieval embedding provider. Default: litellm.
  --embedding-model EMBEDDING_MODEL
                        Embedding model when --embedding-provider litellm. A
                        'local:' prefix uses the on-machine FastEmbed ONNX
                        encoder; other prefixes route through litellm.
                        Default: local:BAAI/bge-large-en-v1.5.
  --grade-workers GRADE_WORKERS
                        Max concurrent dataset grade() calls. Default: 1.
  --codex-concurrency CODEX_CONCURRENCY
                        Max concurrent codex exec subprocesses in this Python
                        process. Default: 30.
  --docker-pull {missing,always,never}
                        Docker image pull policy for Docker-backed datasets.
                        Default: missing.
  --difficulty DIFFICULTY
                        Comma-separated difficulty filter. Only honored by TB2
                        dataset.
  --cache {on,off,readonly,refresh}
                        Agent response cache mode. Default: off.
  --cache-dir CACHE_DIR
                        Agent response cache directory when cache is enabled.
                        Default: <run-dir>/agent-cache.
  --codex-config CODEX_CONFIG
                        Path to a codex config.toml. Copied verbatim into the
                        isolated CODEX_HOME for every agent run. Default:
                        configs/codex.azure-foundry.toml (hits Azure OpenAI Foundry
                        directly with an Entra Bearer refreshed by `az account
                        get-access-token`). See configs/ for alternatives.
```

## meta-harness

```
usage: rho meta-harness [-h] --dataset DATASET [--run-dir RUN_DIR]
                        [--iterations ITERATIONS]
                        [--candidates-per-iter CANDIDATES_PER_ITER]
                        [--search-trials SEARCH_TRIALS]
                        [--max-search-tasks MAX_SEARCH_TASKS]
                        [--max-test-tasks MAX_TEST_TASKS]
                        [--selection-json SELECTION_JSON]
                        [--final-split {val,test}] [--seed SEED]
                        [--task-filter TASK_FILTER]
                        [--max-per-split MAX_PER_SPLIT]
                        [--initial-harness INITIAL_HARNESS] [--model MODEL]
                        [--reasoning-effort {minimal,low,medium,high,xhigh}]
                        [--cache {on,off,readonly,refresh}]
                        [--cache-dir CACHE_DIR]
                        [--codex-concurrency CODEX_CONCURRENCY]
                        [--docker-pull {missing,always,never}]
                        [--difficulty DIFFICULTY]
                        [--codex-config CODEX_CONFIG]

options:
  -h, --help            show this help message and exit
  --dataset DATASET
  --run-dir RUN_DIR     Output directory. Default: runs/<timestamp>-meta-
                        harness-<dataset>/.
  --iterations ITERATIONS
                        Number of Meta-Harness search iterations. Default: 20.
  --candidates-per-iter CANDIDATES_PER_ITER
                        Candidate harnesses the proposer produces per
                        iteration. Default: 3.
  --search-trials SEARCH_TRIALS
                        Solve attempts per task when scoring a candidate on
                        the search set. Default: 2.
  --max-search-tasks MAX_SEARCH_TASKS
                        Cap the fixed search set drawn from the train split.
                        Default: all.
  --max-test-tasks MAX_TEST_TASKS
                        Max test tasks for the final evaluation. 0 skips it.
                        Default: all.
  --selection-json SELECTION_JSON
                        Reuse selected_task_ids from an existing
                        selection.json as the fixed search set.
  --final-split {val,test}
                        Dataset split used for the final held-out evaluation.
                        Default: test.
  --seed SEED
  --task-filter TASK_FILTER
  --max-per-split MAX_PER_SPLIT
                        Cap tasks loaded per dataset split. Default: all.
  --initial-harness INITIAL_HARNESS
                        Seed harness directory path or store ID. Default:
                        dataset built-in harness.
  --model MODEL         Codex model for the proposer and solver. Default:
                        gpt-5.5.
  --reasoning-effort {minimal,low,medium,high,xhigh}
                        Codex reasoning effort. Default: high.
  --cache {on,off,readonly,refresh}
                        Agent response cache mode. Default: off.
  --cache-dir CACHE_DIR
                        Agent response cache directory when cache is enabled.
                        Default: <run-dir>/agent-cache.
  --codex-concurrency CODEX_CONCURRENCY
                        Max concurrent codex exec subprocesses in this Python
                        process. Default: 30.
  --docker-pull {missing,always,never}
                        Docker image pull policy for datasets that grade in
                        Docker. Default: missing.
  --difficulty DIFFICULTY
                        Comma-separated difficulty filter
                        (easy,medium,hard,extreme). Only honored by TB2.
  --codex-config CODEX_CONFIG
                        Path to a codex config.toml. Copied verbatim into the
                        isolated CODEX_HOME for every agent run. Default:
                        configs/codex.azure-foundry.toml (hits Azure OpenAI Foundry
                        directly with an Entra Bearer refreshed by `az account
                        get-access-token`). See configs/ for alternatives.
```

## ui

```
usage: rho ui [-h] [--runs-dir RUNS_DIR] [--host HOST] [--port PORT]

options:
  -h, --help           show this help message and exit
  --runs-dir RUNS_DIR  Directory containing run folders. Default: runs/
  --host HOST
  --port PORT
```

## tb2-cleanup

```
usage: rho tb2-cleanup [-h] [--all]

options:
  -h, --help  show this help message and exit
  --all       Remove every tbench2-* container, live or not.
```
