# Results (test split)

30 tasks from [bolt.diy](https://github.com/stackblitz-labs/bolt.diy)'s history up to `9cbb4c90` (2026-10-12 to 2026-11-16), 58 modified files to find. The repo averages **785k tokens** (o200k) at those commits. Parameters were chosen on a separate dev split of 30 older tasks (`tuning.md`): graph α=0.85, hub penalty 0; signatures get 40% of the budget. Runtime: 119s for all 450 selections.

- **Full recall**: share of the commit's modified files included verbatim. **Visible**: verbatim *or* as signatures.
- **All in full**: tasks where every modified file was included verbatim.
- **vs BM25**: tasks where the method found more (+) or fewer (−) modified files verbatim than BM25 alone at the same budget.

| Method | Budget | Full recall | Visible | All in full | vs BM25 | Share of repo |
|---|---|---|---|---|---|---|
| Recent files (baseline) | 8k | 17% | 17% | 4/30 | +4 / −16 | 1.0% |
| Recent files (baseline) | 16k | 28% | 28% | 7/30 | +5 / −16 | 2.0% |
| Recent files (baseline) | 32k | 41% | 41% | 10/30 | +4 / −15 | 4.1% |
| BM25 | 8k | 48% | 48% | 13/30 | — | 1.0% |
| BM25 | 16k | 56% | 56% | 15/30 | — | 2.0% |
| BM25 | 32k | 69% | 69% | 19/30 | — | 4.1% |
| BM25 + import graph | 8k | 51% | 51% | 14/30 | +1 / −0 | 1.0% |
| BM25 + import graph | 16k | 58% | 58% | 16/30 | +3 / −2 | 2.0% |
| BM25 + import graph | 32k | 75% | 75% | 20/30 | +4 / −0 | 4.1% |
| BM25 + signatures | 8k | 34% | 69% | 8/30 | +0 / −7 | 1.0% |
| BM25 + signatures | 16k | 52% | 73% | 14/30 | +1 / −4 | 2.0% |
| BM25 + signatures | 32k | 68% | 83% | 19/30 | +0 / −1 | 4.1% |
| BM25 + import graph + signatures | 8k | 33% | 74% | 7/30 | +0 / −7 | 1.0% |
| BM25 + import graph + signatures | 16k | 51% | 79% | 14/30 | +1 / −4 | 2.0% |
| BM25 + import graph + signatures | 32k | 65% | 85% | 18/30 | +0 / −1 | 4.1% |

## Per task: BM25 + signatures, 16k

| Task | Request | Modified | BM25 rank of each | Missed (verbatim) |
|---|---|---|---|---|
| `3cae5eda` | Add terminal output as chat context | 6 | 7, 190, 28, 3, 24, 2 | `Chat.client.tsx`, `ChatBox.tsx`, `TerminalTabs.tsx`, `workbench.ts` |
| `0a2a11ff` | Prevent code changes in discussion mode | 6 | 5, 6, 14, 2, –, 47 | `BaseChat.tsx`, `Chat.client.tsx`, `useMessageParser.ts`, `api.chat.ts` |
| `82b6e7e2` | Enable only onboarding-selected providers | 2 | 1, 2 | — |
| `8f3098ef` | Fix starter template import with invalid GitHub token | 1 | 2 | — |
| `213c99bd` | feat: allow smoke tests to skip onboarding | 1 | 1 | — |
| `07921715` | fix(security): validate API CORS origins | 1 | 1 | — |
| `9e991958` | fix: default Ollama base URL | 1 | 1 | — |
| `deb6c738` | Avoid concurrent public asset copies in Electron builds | 2 | 6, 7 | — |
| `06e1d64e` | fix: stabilize workbench and streaming tests | 2 | 14, 30 | `workbench-lifecycle.spec.ts`, `core-journeys.perf.test.tsx` |
| `5ae893cc` | Move model settings caret after label | 1 | 32 | `ChatBox.tsx` |
| `8eeaf5c4` | Label expanded model settings toggle | 1 | 66 | `ChatBox.tsx` |
| `48edd2cd` | Move microphone next to tool access menu | 1 | 2 | — |
| `922a5c0d` | perf: guard static composer handoff | 2 | 1, 2 | — |
| `70a5f257` | perf: highlight chat code blocks in a worker | 1 | 9 | `CodeBlock.tsx` |
| `c89f3a39` | Avoid model refetches on provider selection | 1 | 44 | `BaseChat.tsx` |
| `7fd6e157` | fix: attach agent completion evidence automatically | 3 | 1, 2, 3 | — |
| `8133577a` | fix: style connector configure buttons | 1 | 1 | — |
| `79eac0c0` | feat: convert Agent button to dropdown with Agent and Discuss modes | 1 | 1 | — |
| `72bf4bcc` | feat: add Preferences card to Control Panel main view | 1 | 8 | `constants.tsx` |
| `9b9f907d` | fix: restore Import Folder and Import Zip buttons on homescreen | 1 | 157 | `BaseChat.tsx` |
| `b196baac` | fix: code review improvements - type safety and documentation | 3 | 119, –, – | `agent-stream.ts`, `connectorActivation.ts`, `clearLocks.ts` |
| `7c117ba2` | Apply onboarding API keys immediately | 3 | 76, 29, 1 | `BaseChat.tsx`, `Chat.client.tsx` |
| `c2eb4e4f` | fix: match visual edits close button background | 1 | 1 | — |
| `b280127d` | fix: preserve Git configuration files in starter templates | 2 | 9, 3 | `api.github-template.ts` |
| `0c1c8e3f` | Add agent activity feed and approval tray | 4 | –, –, 9, – | `AssistantMessage.tsx`, `BaseChat.tsx`, `ToolInvocations.tsx`, `projectMcp.ts` |
| `8b7d8aac` | Match plugin detail tabs to settings buttons | 1 | 1 | `PluginTab.tsx` |
| `f8ba527f` | Show concise marketplace metadata errors | 1 | 4 | — |
| `7532d96b` | Match plugin controls to settings button styles | 1 | 3 | `PluginTab.tsx` |
| `7dc4187e` | Add Browser Use Cloud connector | 1 | 4 | — |
| `8c2d2380` | Fix browser startup and chat tool context | 5 | 85, 36, 40, –, 30 | `entry.server.tsx`, `prompt-workstyle.ts`, `stream-text.ts`, `root.tsx`, `vite.config.ts` |
