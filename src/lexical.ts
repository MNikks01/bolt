import type { Scored, SourceFile } from './types.js';

const STOP = new Set(
  'the a an and or of to in on for with from by is are be this that it as at if not no use add fix make should when into via allow update new get set const let var import export default return function async await type interface class extends true false null undefined ts tsx js jsx mjs cjs'.split(
    ' '
  )
);

/**
 * Code-aware terms: splits camelCase, PascalCase, snake_case, kebab-case and
 * paths, so "selectStarterTemplate" matches a prompt saying "starter template".
 */
export function terms(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []) {
    for (const part of raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(' ')) {
      const t = stem(part.toLowerCase());
      if (t.length > 1 && !STOP.has(t)) out.push(t);
    }
  }
  return out;
}

/** Light stemming: enough to match "templates"/"template", "handling"/"handle". */
function stem(t: string): string {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

/**
 * BM25 over two fields. Path terms count 3×: a file named after the concept
 * is usually where the change goes, and paths are short and dense.
 */
export function bm25(files: SourceFile[], query: string, { k1 = 1.2, b = 0.75, pathWeight = 3 } = {}): Scored[] {
  const q = [...new Set(terms(query))];
  if (q.length === 0) return files.map((f) => ({ path: f.path, score: 0 }));

  const docs = files.map((f) => {
    const tf = new Map<string, number>();
    for (const t of terms(f.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of terms(f.path)) tf.set(t, (tf.get(t) ?? 0) + pathWeight);
    let len = 0;
    for (const v of tf.values()) len += v;
    return { path: f.path, tf, len };
  });
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of q) if (d.tf.has(t)) df.set(t, (df.get(t) ?? 0) + 1);

  return docs.map((d) => {
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = df.get(t)!;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avg));
    }
    return { path: d.path, score };
  });
}
