import type { Snapshot } from './types.js';

const SPEC = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

export function importSpecifiers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SPEC)) {
    const s = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (s) out.push(s);
  }
  return out;
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const p of path.split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return parts.join('/');
}

/** Resolves a specifier to a repo file: relative paths and tsconfig aliases. Packages resolve to null. */
export function resolveImport(from: string, spec: string, known: ReadonlySet<string>, aliases: Record<string, string>): string | null {
  let base: string | null = null;
  if (spec.startsWith('.')) base = normalize(from.split('/').slice(0, -1).join('/') + '/' + spec);
  else {
    for (const [prefix, target] of Object.entries(aliases)) {
      if (spec.startsWith(prefix)) base = normalize(target + spec.slice(prefix.length));
    }
  }
  if (base === null) return null;
  // `import x from './a.js'` may mean a.ts (TS ESM convention).
  const stripped = base.replace(/\.(js|jsx|mjs)$/, '');
  for (const candidate of [base, stripped]) {
    for (const ext of EXTS) if (known.has(candidate + ext)) return candidate + ext;
  }
  return null;
}

/** Undirected adjacency: a file is related to what it imports and to what imports it. */
export function importGraph(snapshot: Snapshot): Map<string, Set<string>> {
  const known = new Set(snapshot.files.map((f) => f.path));
  const g = new Map<string, Set<string>>(snapshot.files.map((f) => [f.path, new Set()]));
  for (const f of snapshot.files) {
    for (const spec of importSpecifiers(f.text)) {
      const to = resolveImport(f.path, spec, known, snapshot.aliases);
      if (to && to !== f.path) {
        g.get(f.path)!.add(to);
        g.get(to)!.add(f.path);
      }
    }
  }
  return g;
}
