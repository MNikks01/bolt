/**
 * Picks graph and packing parameters on the DEV split only, so the test-split
 * numbers in results.md are an honest estimate.
 *   npx tsx eval/tune.ts /path/to/bolt.diy
 */
import { writeFileSync } from 'node:fs';
import { evaluate, loadTasks, summarize, type Config } from './harness.js';

const repo = process.argv[2]!;
const { tasks } = loadTasks('dev');
const BUDGETS = [8_000, 16_000, 32_000];

const graph: Config[] = [{ name: 'bm25', method: 'bm25', fullShare: 1 }];
for (const alpha of [0.5, 0.7, 0.85, 0.95]) for (const hubPenalty of [0, 0.5, 1]) graph.push({ name: `graph a=${alpha} h=${hubPenalty}`, method: 'bm25+graph', graph: { alpha, hubPenalty }, fullShare: 1 });

const rows = evaluate(repo, tasks, graph, BUDGETS);
const scored = graph.map((c) => ({ c, s: summarize(rows, c.name) })).sort((a, b) => b.s.full - a.s.full);
let md = `# Tuning (dev split, ${tasks.length} tasks; objective: mean full recall over 8k/16k/32k)\n\n| Config | Full recall (mean) | 8k | 16k | 32k |\n|---|---|---|---|---|\n`;
for (const { c, s } of scored) md += `| ${c.name} | ${(s.full * 100).toFixed(1)}% | ${BUDGETS.map((b) => (summarize(rows, c.name, b).full * 100).toFixed(0) + '%').join(' | ')} |\n`;

const bestGraph = scored.find((x) => x.c.method === 'bm25+graph')!.c;
const shares: Config[] = [0.6, 0.75, 0.9].map((fullShare) => ({ ...bestGraph, name: `${bestGraph.name} share=${fullShare}`, fullShare }));
const rows2 = evaluate(repo, tasks, shares, BUDGETS);
md += `\n## Signature share (with ${bestGraph.name}; objective: mean of full and visible recall)\n\n| fullShare | Full | Visible | Objective |\n|---|---|---|---|\n`;
const s2 = shares.map((c) => ({ c, s: summarize(rows2, c.name) })).map((x) => ({ ...x, obj: (x.s.full + x.s.visible) / 2 })).sort((a, b) => b.obj - a.obj);
for (const { c, s, obj } of s2) md += `| ${c.fullShare} | ${(s.full * 100).toFixed(1)}% | ${(s.visible * 100).toFixed(1)}% | ${(obj * 100).toFixed(1)}% |\n`;
md += `\n**Chosen:** ${bestGraph.name}, fullShare=${s2[0]!.c.fullShare}\n`;
writeFileSync(new URL('./tuning.md', import.meta.url), md);
writeFileSync(new URL('./chosen.json', import.meta.url), JSON.stringify({ graph: bestGraph.graph, fullShare: s2[0]!.c.fullShare }, null, 2) + '\n');
console.log(md);
