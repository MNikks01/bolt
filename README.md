# bolt-context-selection

Given a repo and a request, pick the files a coding agent should see within a token budget, and compress the next tier down to signatures. It's evaluated on **30 real tasks from bolt.diy's own git history**, with a separate dev split for tuning.

**Why:** Bolt's [own docs](https://support.bolt.new/best-practices/manage-context) tell users large context causes errors and worse results.

## Result

bolt.diy is ~785k tokens of source. At a 16k budget (2% of the repo):

| Method | Needed files included verbatim | …verbatim or as signatures |
|---|---|---|
| Recently changed files (baseline) | 28% | 28% |
| BM25 (code-aware lexical ranking) | 56% | 56% |
| BM25 + import graph | **58%** | 58% |
| BM25 + import graph + signatures | 51% | **79%** |

Full table (8k/16k/32k, paired win/loss counts, per-task ranks): [`eval/results.md`](eval/results.md). Tuning: [`eval/tuning.md`](eval/tuning.md).

## What I learned

1. **Lexical ranking does most of the work.** Splitting identifiers and paths into words ("selectStarterTemplate" → *select starter template*), with path terms weighted 3×, triples the recent-files baseline at 8k (48% vs 17%). It's zero-cost: no model call, and ranking 578 files takes ~0.2s.
2. **The import graph helps a little, and only after tuning.** With my first parameters it *lost* to plain BM25 at 8k (39% vs 48%). Tuned on the dev split only, it beats BM25 on the test split at every budget: +1/−0, +3/−2 and +4/−0 tasks at 8k, 16k and 32k. That's consistent, but small for n=30: suggestive, not proven.
3. **Signatures trade depth for breadth.** Giving 40% of the budget to bodies-elided signatures (13% of a file's tokens on average) raises "visible" recall from 58% to 79% at 16k, but drops verbatim recall by 7 points. Whether that's a win depends on whether the agent can request a file it has seen the signature of. In Bolt, it can.
4. **The biggest group of misses is about granularity, not ranking.** 13 of the 33 files missed verbatim at 16k are four big UI files: `BaseChat.tsx` (4.6k tokens), `Chat.client.tsx` (9.4k), `ChatBox.tsx` (4.7k), `PluginTab.tsx` (10.5k). `PluginTab.tsx` ranked **#1** and still didn't fit in the 9.6k full-file share. Whole-file packing can't handle these. **Next experiment: select functions and components inside large files** (the AST code here already finds them), so a 10k-token file contributes the 800 tokens that matter.
5. **Vague requests defeat lexical retrieval.** "fix: code review improvements - type safety and documentation" ranks its files at 119 and beyond. That's where an embedding model, or bolt.diy's LLM picker, should earn its cost.

## How bolt.diy selects context today

`app/lib/.server/llm/select-context.ts` makes an **extra LLM call** per request. It sends all file paths (≈6k tokens for this repo) and asks for at most 5 files. [`eval/llm-baseline.ts`](eval/llm-baseline.ts) runs that exact prompt on the same test tasks with the same metric:

```bash
ANTHROPIC_API_KEY=... npx tsx eval/llm-baseline.ts /path/to/bolt.diy
```

**Not run yet** (no API key here). The interesting comparison is recall per token and per second against `results.md`. So is a hybrid: give the LLM the top-50 ranked paths plus signatures, instead of all 578 paths.

## Try it

```bash
npm ci && npm run check
git clone https://github.com/stackblitz-labs/bolt.diy /tmp/bolt
node dist/cli.js /tmp/bolt "Fix starter template import with invalid GitHub token" --budget 8000
#   578 files, 815030 tokens → 7982 tokens (1.0%)
#   Full: app/routes/api.github-template.ts, app/utils/selectStarterTemplate.ts, …
node dist/cli.js /tmp/bolt "..." --print     # the packed context itself
```

Reproduce the evaluation (about 2 min for the test split, 6 min for tuning):

```bash
npm run mine -- /tmp/bolt 60                  # rewrites eval/tasks.json; it's committed, so optional
npx tsx eval/tune.ts /tmp/bolt                # dev split → eval/chosen.json
npm run eval -- /tmp/bolt                     # test split → eval/results.md
```

## Method, and what it doesn't measure

- **Tasks:** non-merge commits on bolt.diy up to `9cbb4c90`.
  - The commit subject is the request. The repo at the parent commit is what the agent sees. The source files the commit **modified** are what it needed.
  - Commits that modify 1–6 files, with at least 4 content words.
  - Excluded: reverts, lint/format/deps/docs/release commits, near-duplicate subjects, and subjects naming a file (they give the answer away).
  - The newest 30 are the test split; the 30 older ones are the dev split.
- **Tuning discipline:** every parameter (graph α and hub penalty, signature share) was chosen on dev. The test split ran once with those values. One bug fix after that run (extension stopwords) was re-run end to end: same numbers.
- **Tokens:** OpenAI's o200k encoding as a proxy, since Claude's tokenizer isn't public. It's applied identically to every method.
- **Limits:**
  - A commit subject is terser than a real user request in a chat.
  - "Modified" undercounts what an agent needs to *read*: types, callers, examples.
  - Recall isn't task success. The real metric is "did the agent's patch pass", which needs an agent loop and a sandbox, i.e. Bolt itself.
  - One repo, 30 test tasks.

## Trade-offs that matter

| Decision | Why | Cost |
|---|---|---|
| **Lexical + graph, no embeddings by default** | Deterministic, ~0.2s to rank, zero model cost, no index to keep in sync with a repo that changes every message. | Misses paraphrased requests (finding 5). The embedding ranker is the next experiment; Hugging Face downloads are blocked in the sandbox I built this in. |
| **Skip, don't truncate, files that don't fit** | Half a file misleads a model more than a missing file. The next-ranked file may fit. | Big files lose out (finding 4); symbol-level selection is the fix. |
| **Signatures via the TypeScript compiler API, not regex** | Handles `memo(() => …)`, class members, accessors and TSX correctly. Imports and types are kept verbatim, because that's what lets a model call code it can't see. | JS/TS only. Other languages need tree-sitter. |
| **No caching yet** | Simple and correct. | Packing is ~3s cold, mostly token counting and signature parsing of candidate files. In Bolt, both would be cached per file content hash, since few files change between messages. |
| **Snapshot read from git objects, not a checkout** | One `git cat-file --batch` per task: 60 historical snapshots in seconds, without touching a working tree. | Needs the repo history (a full clone). |
