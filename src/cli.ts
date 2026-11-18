#!/usr/bin/env node
/**
 *   node dist/cli.js <git-repo> "<request>" [--budget 16000] [--share 0.6] [--method bm25+graph] [--print]
 *
 * Shows which files would go into context for a request, at HEAD. --print
 * outputs the packed context itself.
 */
import { loadSnapshot } from './git.js';
import { rank, type Method } from './rank.js';
import { select } from './select.js';
import { countTokens } from './tokens.js';

const [repo, prompt, ...rest] = process.argv.slice(2);
if (!repo || !prompt) {
  console.error('usage: cli <git-repo> "<request>" [--budget 16000] [--share 0.6] [--method bm25|bm25+graph] [--print]');
  process.exit(1);
}
const flag = (name: string, def: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1]! : def;
};
const budget = Number(flag('budget', '16000'));
const fullShare = Number(flag('share', '0.6'));
const method = flag('method', 'bm25+graph') as Method;
// Chosen on the dev split (eval/chosen.json).
const graph = { alpha: 0.85, hubPenalty: 0 };

const snap = loadSnapshot(repo, 'HEAD');
const ranked = rank(snap, prompt, method, graph);
const sel = select(snap, prompt, { method, budget, fullShare, ranked });

if (rest.includes('--print')) {
  process.stdout.write(sel.context);
} else {
  const repoTokens = snap.files.reduce((s, f) => s + countTokens(f.text), 0);
  console.log(`${snap.files.length} files, ${repoTokens} tokens → ${sel.tokens} tokens (${((sel.tokens / repoTokens) * 100).toFixed(1)}%)\n`);
  console.log('Full:');
  for (const p of sel.full) console.log(`  ${p}`);
  console.log('\nSignatures:');
  for (const p of sel.signatures) console.log(`  ${p}`);
}
