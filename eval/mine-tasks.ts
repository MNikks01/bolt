/**
 * Turns real commits into eval tasks: the commit subject is the request, the
 * parent commit is the repo the agent sees, and the source files the commit
 * modified are the files it needed.
 *
 *   npm run mine -- /path/to/bolt.diy [count]
 *
 * Writes eval/tasks.json. Committed, so results are reproducible without
 * re-mining.
 */
import { writeFileSync } from 'node:fs';
import { git, isSource } from '../src/git.js';

const repo = process.argv[2];
const count = Number(process.argv[3] ?? 60);
if (!repo) throw new Error('usage: npm run mine -- <repo> [count]');

// Commits whose message says nothing about *where* the change is, or that
// touch everything mechanically.
const SKIP = /^(merge|revert|style|chore|docs?|test|ci|build|release|bump)\b|revert|git push|#release|lint|format|prettier|typo|wip|rename|cleanup|clean up|i18n|translation|readme|changelog|deps?\b|dependenc|upgrade|version|\bfinal\b|temporarily/i;
// A subject that names a source file gives the answer away.
const NAMES_FILE = /[\w-]+\.(ts|tsx|js|jsx)\b/;
const words = (s: string) => new Set(s.toLowerCase().replace(/^\w+(\([^)]*\))?:\s*/, '').match(/[a-z0-9]+/g) ?? []);
const similar = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length / Math.max(1, Math.min(a.size, b.size)) > 0.6;

const head = git(repo, ['rev-parse', 'HEAD']).trim();
const log = git(repo, ['log', '--no-merges', '--format=%H%x09%P%x09%cs%x09%s', head]).trim().split('\n');

// The newest half is the test set, reported once. The older half is the dev
// set, the only data any parameter was tuned on.
type Task = { id: string; split: 'test' | 'dev'; sha: string; parent: string; date: string; prompt: string; edited: string[]; added: string[] };
const tasks: Task[] = [];
const seen: Array<Set<string>> = [];

for (const line of log) {
  if (tasks.length >= count) break;
  const [sha, parents, date, subject] = line.split('\t') as [string, string, string, string];
  const parent = parents.split(' ')[0];
  const w = words(subject);
  // At least 4 content words after the "fix(scope):" prefix: a request, not a label.
  if (!parent || SKIP.test(subject) || NAMES_FILE.test(subject) || w.size < 4 || seen.some((x) => similar(x, w))) continue;

  const status = git(repo, ['diff', '--name-status', '--no-renames', parent, sha]).trim().split('\n').map((l) => l.split('\t') as [string, string]);
  const edited = status.filter(([s, p]) => s === 'M' && isSource(p)).map(([, p]) => p);
  const added = status.filter(([s, p]) => s === 'A' && isSource(p)).map(([, p]) => p);
  // 1–6 modified files: a focused change. Larger commits are refactors, where
  // "which files" isn't a retrieval question.
  if (edited.length < 1 || edited.length > 6) continue;
  if (status.length > 12) continue;

  seen.push(w);
  tasks.push({ id: sha.slice(0, 8), split: tasks.length < count / 2 ? 'test' : 'dev', sha, parent, date, prompt: subject.replace(/\s*\(#\d+\)\s*$/, ''), edited, added });
}

writeFileSync(new URL('./tasks.json', import.meta.url), JSON.stringify({ repo: 'stackblitz-labs/bolt.diy', head, minedAt: new Date().toISOString().slice(0, 10), tasks }, null, 2) + '\n');
console.log(`${tasks.length} tasks from ${repo} @ ${head.slice(0, 8)}`);
for (const t of tasks) console.log(`${t.split.padEnd(4)} ${t.id} ${t.date} [${t.edited.length}] ${t.prompt}`);
