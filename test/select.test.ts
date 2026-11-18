import { describe, expect, test } from 'vitest';
import { importGraph, importSpecifiers, resolveImport } from '../src/imports.js';
import { bm25, terms } from '../src/lexical.js';
import { graphRank, rank } from '../src/rank.js';
import { select } from '../src/select.js';
import { signatures } from '../src/signatures.js';
import { countTokens } from '../src/tokens.js';
import type { Snapshot } from '../src/types.js';

describe('terms', () => {
  test('splits identifiers and paths the way prompts are written', () => {
    expect(terms('selectStarterTemplate')).toEqual(['select', 'starter', 'template']);
    expect(terms('app/lib/stores/files.ts')).toEqual(['app', 'lib', 'store', 'file']);
    expect(terms('HTMLParser parse_xml_tags')).toEqual(['html', 'parser', 'parse', 'xml', 'tag']);
    // Language keywords (import, export, const…) are in nearly every file: no signal, so stopwords.
    expect(terms('Fix the import with invalid GitHub token')).toEqual(['invalid', 'git', 'hub', 'token']);
  });
});

const snap: Snapshot = {
  aliases: { '~/': 'app/' },
  files: [
    { path: 'app/components/chat/Chat.tsx', text: "import { useStore } from '~/lib/stores/chat';\nexport const Chat = () => { return null };" },
    { path: 'app/lib/stores/chat.ts', text: "import { logger } from '../../utils/logger.js';\nexport function useStore() { return 1 }" },
    { path: 'app/utils/logger.ts', text: 'export const logger = console;' },
    { path: 'app/lib/starter/template.ts', text: 'export function selectStarterTemplate(token: string) { /* github token */ }' },
    { path: 'app/routes/index.tsx', text: "import { Chat } from '~/components/chat/Chat';\nimport x from 'react';" },
  ],
};

describe('imports', () => {
  test('extracts static, dynamic, re-export and require specifiers', () => {
    const src = "import a from './a';\nimport type { B } from \"~/b\";\nexport * from './c';\nconst d = await import('./d');\nconst e = require('e');\nimport './side-effect';";
    expect(importSpecifiers(src)).toEqual(['./a', '~/b', './c', './d', 'e', './side-effect']);
  });

  test('resolves relative, aliased, .js→.ts and index files; packages are null', () => {
    const known = new Set(['app/a.ts', 'app/dir/index.tsx', 'app/lib/x.ts']);
    expect(resolveImport('app/main.ts', './a', known, {})).toBe('app/a.ts');
    expect(resolveImport('app/main.ts', './a.js', known, {})).toBe('app/a.ts');
    expect(resolveImport('app/main.ts', './dir', known, {})).toBe('app/dir/index.tsx');
    expect(resolveImport('app/deep/y.ts', '~/lib/x', known, { '~/': 'app/' })).toBe('app/lib/x.ts');
    expect(resolveImport('app/main.ts', 'react', known, { '~/': 'app/' })).toBeNull();
  });

  test('the graph is undirected and ignores packages', () => {
    const g = importGraph(snap);
    expect([...g.get('app/lib/stores/chat.ts')!].sort()).toEqual(['app/components/chat/Chat.tsx', 'app/utils/logger.ts']);
    expect([...g.get('app/routes/index.tsx')!]).toEqual(['app/components/chat/Chat.tsx']);
  });
});

describe('ranking', () => {
  test('BM25 finds the file whose identifiers and path match the request', () => {
    const top = rank(snap, 'Fix starter template import with invalid GitHub token', 'bm25')[0]!;
    expect(top.path).toBe('app/lib/starter/template.ts');
  });

  test('the graph lends score to imports of a matching file', () => {
    // "store" matches the store (path) and Chat.tsx (its import text), not logger.ts.
    const lexical = bm25(snap.files, 'store');
    expect(lexical.find((s) => s.path === 'app/utils/logger.ts')!.score).toBe(0);
    const after = graphRank(snap, lexical, { alpha: 0.5 }).find((s) => s.path === 'app/utils/logger.ts')!.score;
    expect(after).toBeGreaterThan(0);
  });
});

describe('signatures', () => {
  test('keeps the API, drops bodies', () => {
    const src = `import { x } from './x';
export interface Props { id: string }
export type Mode = 'a' | 'b';
export function load(id: string): Promise<Props> {
  const secret = 'body detail';
  return fetch(id) as never;
}
export const Card = memo(({ id }: Props) => {
  return <div>{id}</div>;
});
export class Store {
  #items = new Map<string, number>();
  constructor(private readonly db: string) { console.log('body'); }
  get size(): number { return this.#items.size; }
  async add(k: string): Promise<void> { this.#items.set(k, 1); }
}
doSomethingAtImport();`;
    const sig = signatures('a.tsx', src);
    expect(sig).toContain("import { x } from './x';");
    expect(sig).toContain('export interface Props { id: string }');
    expect(sig).toContain('export function load(id: string): Promise<Props> { … }');
    expect(sig).toContain('export const Card = memo(({ id }: Props) => { … }');
    expect(sig).toContain('async add(k: string): Promise<void> { … }');
    expect(sig).toContain('get size(): number { … }');
    expect(sig).not.toContain('body detail');
    expect(sig).not.toContain("console.log('body')");
    expect(sig).not.toContain('doSomethingAtImport');
  });

  test('long non-function initializers are elided, short ones kept', () => {
    const sig = signatures('a.ts', `export const LIMIT = 10;\nexport const TABLE = { ${'a: 1, '.repeat(60)} };`);
    expect(sig).toContain('export const LIMIT = 10;');
    expect(sig).toContain('export const TABLE = …');
  });
});

describe('select', () => {
  test('never exceeds the budget and skips (does not truncate) files that do not fit', () => {
    const big = { path: 'app/lib/starter/huge.ts', text: 'export function starterTemplate() { ' + 'x();'.repeat(3000) + ' }' };
    const s: Snapshot = { ...snap, files: [...snap.files, big] };
    const sel = select(s, 'starter template github token', { method: 'bm25', budget: 600, fullShare: 1 });
    expect(sel.tokens).toBeLessThanOrEqual(600);
    expect(sel.full).toContain('app/lib/starter/template.ts');
    expect(sel.full).not.toContain('app/lib/starter/huge.ts');
    expect(countTokens(sel.context)).toBeLessThanOrEqual(600 + 5);
  });

  test('signatures fill the remaining share of the budget', () => {
    const sel = select(snap, 'chat store logger', { method: 'bm25', budget: 120, fullShare: 0.5 });
    expect(sel.signatures.length).toBeGreaterThan(0);
    expect(sel.context).toContain('view="signatures"');
    expect(new Set([...sel.full, ...sel.signatures]).size).toBe(sel.full.length + sel.signatures.length);
  });
});
