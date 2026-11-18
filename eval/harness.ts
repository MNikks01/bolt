import { readFileSync } from 'node:fs';
import { git, isSource, loadSnapshot } from '../src/git.js';
import { graphRank, type GraphOptions } from '../src/rank.js';
import { bm25 } from '../src/lexical.js';
import { select } from '../src/select.js';
import { countTokens } from '../src/tokens.js';
import type { Scored, Snapshot } from '../src/types.js';

export type Task = { id: string; split: 'test' | 'dev'; sha: string; parent: string; date: string; prompt: string; edited: string[]; added: string[] };
export type Config = { name: string; method: 'recent' | 'bm25' | 'bm25+graph'; graph?: GraphOptions; fullShare: number };
export type Row = { task: string; config: string; budget: number; fullRecall: number; visibleRecall: number; allFull: boolean; tokens: number; repoTokens: number; missed: string[]; rankOfEdited: number[] };

export function loadTasks(split: 'test' | 'dev') {
  const all = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url), 'utf8')) as { head: string; tasks: Task[] };
  return { head: all.head, tasks: all.tasks.filter((t) => t.split === split) };
}

/** Baseline: files ordered by how recently they changed before the task. */
function recentRanking(repo: string, snapshot: Snapshot, parent: string): Scored[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const p of git(repo, ['log', '-n', '400', '--name-only', '--format=', parent]).split('\n')) {
    if (p && isSource(p) && !seen.has(p)) {
      seen.add(p);
      order.push(p);
    }
  }
  const known = new Set(snapshot.files.map((f) => f.path));
  return order.filter((p) => known.has(p)).map((path, i) => ({ path, score: order.length - i }));
}

const sortScored = (xs: Scored[]) => [...xs].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

/** Every config × budget for every task. Snapshots and lexical scores are computed once per task. */
export function evaluate(repo: string, tasks: Task[], configs: Config[], budgets: number[], progress = true): Row[] {
  const rows: Row[] = [];
  for (const t of tasks) {
    const snap = loadSnapshot(repo, t.parent);
    const repoTokens = snap.files.reduce((s, f) => s + countTokens(f.text), 0);
    const edited = t.edited.filter((p) => snap.files.some((f) => f.path === p));
    const lexical = bm25(snap.files, t.prompt);
    const cache = new Map<string, Scored[]>();
    for (const c of configs) {
      const key = `${c.method}|${JSON.stringify(c.graph ?? {})}`;
      if (!cache.has(key)) {
        cache.set(key, c.method === 'recent' ? recentRanking(repo, snap, t.parent) : sortScored(c.method === 'bm25' ? lexical : graphRank(snap, lexical, c.graph)));
      }
      const ranked = cache.get(key)!;
      const rankOfEdited = edited.map((p) => ranked.findIndex((s) => s.path === p && s.score > 0) + 1 || Infinity);
      for (const budget of budgets) {
        const sel = select(snap, t.prompt, { method: 'bm25', budget, fullShare: c.fullShare, ranked });
        const full = new Set(sel.full);
        const visible = new Set([...sel.full, ...sel.signatures]);
        const inFull = edited.filter((p) => full.has(p)).length;
        rows.push({ task: t.id, config: c.name, budget, fullRecall: inFull / edited.length, visibleRecall: edited.filter((p) => visible.has(p)).length / edited.length, allFull: inFull === edited.length, tokens: sel.tokens, repoTokens, missed: edited.filter((p) => !full.has(p)), rankOfEdited });
      }
    }
    if (progress) process.stderr.write('.');
  }
  if (progress) process.stderr.write('\n');
  return rows;
}

export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);
export const summarize = (rows: Row[], config: string, budget?: number) => {
  const rs = rows.filter((r) => r.config === config && (budget === undefined || r.budget === budget));
  return { full: mean(rs.map((r) => r.fullRecall)), visible: mean(rs.map((r) => r.visibleRecall)), allFull: rs.filter((r) => r.allFull).length, n: rs.length, tokens: mean(rs.map((r) => r.tokens)), share: mean(rs.map((r) => r.tokens / r.repoTokens)) };
};
