# LOCOMO Hard

This dataset is an explicit hard subset of `data/locomo10.json`.

It was selected by running `scripts/extract_hard_locomo_subset.py` against
the dataset harness and taking the lowest-scoring 20 tasks from 100
stratified samples in each split.

- Source run: `runs/locomo-hard-100x2`
- Train split: 20 tasks
- Val split: 20 tasks
- Test split: 0 tasks

Use it with:

```bash
uv run rho evolve --dataset locomo-hard:data/locomo-hard --rounds 1
```
