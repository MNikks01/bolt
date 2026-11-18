import { execFileSync, spawnSync } from 'node:child_process';
import ts from 'typescript';
import type { Snapshot, SourceFile } from './types.js';

export const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORE = /(^|\/)(node_modules|dist|build|\.cache|vendor)\/|\.d\.ts$|\.min\.js$|(^|\/)(pnpm-lock|package-lock)\./;
export const isSource = (p: string) => SOURCE.test(p) && !IGNORE.test(p);

const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 ** 2 });

/** Reads every source file at `sha` without checking it out (one `git cat-file --batch`). */
export function loadSnapshot(repo: string, sha: string): Snapshot {
  const paths = git(repo, ['ls-tree', '-r', '--name-only', sha]).split('\n').filter((p) => p && isSource(p));
  const input = paths.map((p) => `${sha}:${p}`).join('\n') + '\n';
  const res = spawnSync('git', ['-C', repo, 'cat-file', '--batch'], { input, maxBuffer: 512 * 1024 ** 2 });
  const buf = res.stdout;
  const files: SourceFile[] = [];
  let pos = 0;
  for (const path of paths) {
    const nl = buf.indexOf(10, pos);
    const header = buf.subarray(pos, nl).toString();
    const size = Number(header.split(' ')[2]);
    const text = buf.subarray(nl + 1, nl + 1 + size).toString('utf8');
    pos = nl + 1 + size + 1;
    // Generated or vendored blobs: huge single-line files aren't context.
    if (size > 200_000) continue;
    files.push({ path, text });
  }
  return { files, aliases: readAliases(repo, sha) };
}

/** tsconfig `compilerOptions.paths` like {"~/*": ["./app/*"]} → {"~/": "app/"}. */
export function readAliases(repo: string, sha: string): Record<string, string> {
  let raw: string;
  try {
    raw = git(repo, ['show', `${sha}:tsconfig.json`]);
  } catch {
    return {};
  }
  const { config } = ts.parseConfigFileTextToJson('tsconfig.json', raw);
  const paths: Record<string, string[]> = config?.compilerOptions?.paths ?? {};
  const out: Record<string, string> = {};
  for (const [k, [v]] of Object.entries(paths)) {
    if (k.endsWith('/*') && v?.endsWith('/*')) out[k.slice(0, -1)] = v.slice(0, -1).replace(/^\.\//, '');
  }
  return out;
}

export { git };
