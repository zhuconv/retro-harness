# Vendored datasets

## `locomo10.json`

Curated 10-conversation release of the **LOCOMO** benchmark
(Maharana et al., ACL 2024).

- **Upstream:** <https://github.com/snap-research/locomo>
- **Source path:** `data/locomo10.json`
- **Upstream commit (main):** `3eb6f2c585f5e1699204e3c3bdf7adc5c28cb376`
- **Fetched:** 2026-04-11 from
  <https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json>
- **Size:** 2,805,274 bytes (~2.7 MB)
- **Contents:** 10 conversations, 272 sessions, 1986 QA pairs
  (282/321/96/841/446 across categories 1-5).

### Paper

> Maharana, Adyasha, Dong-Hyun Lee, Sergey Tulyakov, Mohit Bansal,
> Francesco Barbieri, Yuwei Fang.
> *Evaluating Very Long-Term Conversational Memory of LLM Agents.*
> ACL 2024. <https://arxiv.org/abs/2402.17753>

### License

The upstream `LICENSE.txt` in snap-research/locomo applies. This file
is redistributed unchanged. See
<https://github.com/snap-research/locomo/blob/main/LICENSE.txt>.

### Note on images

Multimodal turns contain `img_url` fields pointing to third-party hosts
(reddit, flickr, etc.). Upstream does not redistribute image bytes and
many URLs are link-rotted. `rho` does not fetch them — see
`docs/superpowers/specs/2026-04-11-locomo-dataset-design.md` §7.1 for
how multimodal turns are rendered as text in the harness.

## `locomo-hard/`

Hard subset of `locomo10.json` selected from
`runs/locomo-hard-100x2/reports/`. It keeps the original LOCOMO prompt,
harness, and grader, but replaces the split membership with explicit hard
task IDs:

- train: 20 tasks
- val: 20 tasks
- test: 0 tasks

Load with `--dataset locomo-hard:data/locomo-hard`.
