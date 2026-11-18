/**
 * bolt.diy's own context selection (app/lib/.server/llm/select-context.ts):
 * one LLM call that sees every file path and returns up to 5 files to load.
 * Same test tasks, same recall metric, so it's directly comparable with
 * results.md. Uses the system/user prompts from bolt.diy, with an empty
 * context buffer and no chat summary (a fresh chat).
 *
 *   ANTHROPIC_API_KEY=... npx tsx eval/llm-baseline.ts /path/to/bolt.diy [model]
 *
 * Writes eval/llm-baseline.md.
 */
import { writeFileSync } from 'node:fs';
import { loadSnapshot } from '../src/git.js';
import { countTokens } from '../src/tokens.js';
import { loadTasks, mean } from './harness.js';

const repo = process.argv[2];
const model = process.argv[3] ?? 'claude-sonnet-5-5';
const key = process.env.ANTHROPIC_API_KEY;
if (!repo || !key) throw new Error('usage: ANTHROPIC_API_KEY=... npx tsx eval/llm-baseline.ts <repo> [model]');

const system = (paths: string[]) => `
        You are a software engineer. You are working on a project. You have access to the following files:

        AVAILABLE FILES PATHS
        ---
        ${paths.map((p) => `- ${p}`).join('\n')}
        ---

        You have following code loaded in the context buffer that you can refer to:

        CURRENT CONTEXT BUFFER
        ---

        ---

        Now, you are given a task. You need to select the files that are relevant to the task from the list of files above.

        RESPONSE FORMAT:
        your response should be in following format:
---
<updateContextBuffer>
    <includeFile path="path/to/file"/>
    <excludeFile path="path/to/file"/>
</updateContextBuffer>
---
        * Your should start with <updateContextBuffer> and end with </updateContextBuffer>.
        * You can include multiple <includeFile> and <excludeFile> tags in the response.
        * You should not include any other text in the response.
        * You should not include any file that is not in the list of files above.
        * You should not include any file that is already in the context buffer.
        * If no changes are needed, you can leave the response empty updateContextBuffer tag.
        `;

const user = (q: string) => `
        Here is the summary of the chat till now:

        Users Question: ${q}

        update the context buffer with the files that are relevant to the task from the list of files above.

        CRITICAL RULES:
        * Only include relevant files in the context buffer.
        * context buffer should not include any file that is not in the list of files above.
        * context buffer is extremlly expensive, so only include files that are absolutely necessary.
        * If no changes are needed, you can leave the response empty updateContextBuffer tag.
        * Only 5 files can be placed in the context buffer at a time.
        * if the buffer is full, you need to exclude files that is not needed and include files that is relevent.

        `;

const { tasks } = loadTasks('test');
const rows = [];
for (const t of tasks) {
  const snap = loadSnapshot(repo, t.parent);
  const paths = snap.files.map((f) => f.path);
  const started = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1024, system: system(paths), messages: [{ role: 'user', content: user(t.prompt) }] }),
  });
  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens: number; output_tokens: number }; error?: { message: string } };
  if (!res.ok) throw new Error(`${res.status}: ${body.error?.message}`);
  const text = body.content?.map((c) => c.text ?? '').join('') ?? '';
  // bolt.diy keeps at most 5 files and drops unknown paths.
  const chosen = [...text.matchAll(/<includeFile path="([^"]+)"\s*\/>/g)].map((m) => m[1]!).filter((p) => paths.includes(p)).slice(0, 5);
  const edited = t.edited.filter((p) => paths.includes(p));
  const hit = edited.filter((p) => chosen.includes(p)).length;
  const tokens = chosen.reduce((s, p) => s + countTokens(snap.files.find((f) => f.path === p)!.text), 0);
  rows.push({ task: t.id, recall: hit / edited.length, allFull: hit === edited.length, tokens, selectionInputTokens: body.usage?.input_tokens ?? 0, latencyMs: Date.now() - started, chosen });
  process.stderr.write('.');
}

const md = `# bolt.diy's LLM context selection (${model}), test split\n\n| Full recall | All in full | Context tokens (mean) | Selection call input tokens (mean) | Selection latency (mean) |\n|---|---|---|---|---|\n| ${Math.round(mean(rows.map((r) => r.recall)) * 100)}% | ${rows.filter((r) => r.allFull).length}/${rows.length} | ${Math.round(mean(rows.map((r) => r.tokens)) / 1000)}k | ${Math.round(mean(rows.map((r) => r.selectionInputTokens)) / 1000)}k | ${(mean(rows.map((r) => r.latencyMs)) / 1000).toFixed(1)}s |\n\nContext tokens vary per task (up to 5 whole files); compare with results.md at a similar budget.\n`;
writeFileSync(new URL('./llm-baseline.md', import.meta.url), md);
writeFileSync(new URL('./llm-baseline.json', import.meta.url), JSON.stringify({ model, rows }, null, 2));
console.log('\n' + md);
