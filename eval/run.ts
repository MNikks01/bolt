/**
 * The reported numbers: TEST split only, with parameters chosen on the dev
 * split (eval/chosen.json, written by eval/tune.ts).
 *
 *   npm run eval -- /path/to/bolt.diy
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, loadTasks, summarize, type Config, type Row } from './harness.js';

const repo = process.argv[2];
if (!repo) throw new Error('usage: npm run eval -- <repo>');
const chosen = JSON.parse(readFileSync(new URL('./chosen.json', import.meta.url), 'utf8')) as { graph: { alpha: number; hubPenalty: number }; fullShare: number };
const { head, tasks } = loadTasks('test');
const BUDGETS = [8_000, 16_000, 32_000];

const CONFIGS: Config[] = [
  { name: 'Recent files (baseline)', method: 'recent', fullShare: 1 },
  { name: 'BM25', method: 'bm25', fullShare: 1 },
  { name: 'BM25 + import graph', method: 'bm25+graph', graph: chosen.graph, fullShare: 1 },
  { name: 'BM25 + signatures', method: 'bm25', fullShare: chosen.fullShare },
  { name: 'BM25 + import graph + signatures', method: 'bm25+graph', graph: chosen.graph, fullShare: chosen.fullShare },
];

const started = Date.now();
const rows = evaluate(repo, tasks, CONFIGS, BUDGETS);
const secs = (Date.now() - started) / 1000;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const k = (n: number) => `${Math.round(n / 1000)}k`;

/** Paired against BM25 at the same budget: tasks where this config found more/fewer modified files verbatim. */
function paired(config: string, budget: number) {
  let better = 0;
  let worse = 0;
  for (const t of tasks) {
    const a = rows.find((r) => r.task === t.id && r.config === config && r.budget === budget)!;
    const b = rows.find((r) => r.task === t.id && r.config === 'BM25' && r.budget === budget)!;
    if (a.fullRecall > b.fullRecall) better++;
    else if (a.fullRecall < b.fullRecall) worse++;
  }
  return `+${better} / −${worse}`;
}

const repoTokens = summarize(rows, CONFIGS[0]!.name, BUDGETS[0]).tokens && rows.filter((r) => r.budget === BUDGETS[0] && r.config === CONFIGS[0]!.name).reduce((s, r) => s + r.repoTokens, 0) / tasks.length;
let md = `# Results (test split)\n\n`;
md += `${tasks.length} tasks from [bolt.diy](https://github.com/stackblitz-labs/bolt.diy)'s history up to \`${head.slice(0, 8)}\` (${tasks.at(-1)!.date} to ${tasks[0]!.date}), ${tasks.reduce((s, t) => s + t.edited.length, 0)} modified files to find. `;
md += `The repo averages **${k(repoTokens)} tokens** (o200k) at those commits. Parameters were chosen on a separate dev split of 30 older tasks (\`tuning.md\`): graph α=${chosen.graph.alpha}, hub penalty ${chosen.graph.hubPenalty}; signatures get ${Math.round((1 - chosen.fullShare) * 100)}% of the budget. Runtime: ${secs.toFixed(0)}s for all ${CONFIGS.length * BUDGETS.length * tasks.length} selections.\n\n`;
md += `- **Full recall**: share of the commit's modified files included verbatim. **Visible**: verbatim *or* as signatures.\n- **All in full**: tasks where every modified file was included verbatim.\n- **vs BM25**: tasks where the method found more (+) or fewer (−) modified files verbatim than BM25 alone at the same budget.\n\n`;
md += `| Method | Budget | Full recall | Visible | All in full | vs BM25 | Share of repo |\n|---|---|---|---|---|---|---|\n`;
for (const c of CONFIGS) {
  for (const b of BUDGETS) {
    const s = summarize(rows, c.name, b);
    md += `| ${c.name} | ${k(b)} | ${pct(s.full)} | ${pct(s.visible)} | ${s.allFull}/${s.n} | ${c.name === 'BM25' ? '—' : paired(c.name, b)} | ${(s.share * 100).toFixed(1)}% |\n`;
  }
}

const show = 'BM25 + signatures';
md += `\n## Per task: ${show}, 16k\n\n| Task | Request | Modified | BM25 rank of each | Missed (verbatim) |\n|---|---|---|---|---|\n`;
for (const t of tasks) {
  const r = rows.find((x: Row) => x.task === t.id && x.config === show && x.budget === 16_000)!;
  md += `| \`${t.id}\` | ${t.prompt.replace(/\|/g, '\\|')} | ${t.edited.length} | ${r.rankOfEdited.map((n) => (n === Infinity ? '–' : n)).join(', ')} | ${r.missed.map((p) => `\`${p.split('/').pop()}\``).join(', ') || '—'} |\n`;
}

writeFileSync(new URL('./results.md', import.meta.url), md);
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify({ head, chosen, budgets: BUDGETS, configs: CONFIGS, rows }, null, 2));
console.log(md.split('\n## Per task')[0]);
