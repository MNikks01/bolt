import { rank, type Method } from './rank.js';
import { signatures } from './signatures.js';
import { countTokens } from './tokens.js';
import type { Scored, Selection, Snapshot } from './types.js';

export type SelectOptions = {
  method: Method;
  /** Total tokens the context may use. */
  budget: number;
  /**
   * Share of the budget for full files; the rest holds signatures of the
   * next-ranked files. 1 = full files only.
   */
  fullShare?: number;
  /** Precomputed ranking (lets the eval rank once and pack at several budgets). */
  ranked?: Scored[];
};

const block = (path: string, body: string, note = '') => `<file path="${path}"${note}>\n${body}\n</file>\n`;

/**
 * Greedy packing in rank order. A file that doesn't fit is skipped, not
 * truncated: half a file misleads a model more than a missing one, and the
 * next file down may fit.
 */
export function select(snapshot: Snapshot, prompt: string, o: SelectOptions): Selection {
  const ranked = (o.ranked ?? rank(snapshot, prompt, o.method)).filter((s) => s.score > 0);
  const byPath = new Map(snapshot.files.map((f) => [f.path, f]));
  const fullBudget = Math.floor(o.budget * (o.fullShare ?? 0.75));
  const full: string[] = [];
  const sigs: string[] = [];
  let context = '';
  let used = 0;

  let i = 0;
  for (; i < ranked.length && used < fullBudget; i++) {
    const f = byPath.get(ranked[i]!.path)!;
    const piece = block(f.path, f.text);
    const t = countTokens(piece);
    if (used + t > fullBudget) continue;
    full.push(f.path);
    context += piece;
    used += t;
  }
  const chosen = new Set(full);
  for (const s of ranked) {
    if (used >= o.budget) break;
    if (chosen.has(s.path)) continue;
    const f = byPath.get(s.path)!;
    const sig = signatures(f.path, f.text);
    if (!sig.trim()) continue;
    const piece = block(f.path, sig, ' view="signatures"');
    const t = countTokens(piece);
    if (used + t > o.budget) continue;
    sigs.push(f.path);
    context += piece;
    used += t;
  }
  return { full, signatures: sigs, tokens: used, context };
}
