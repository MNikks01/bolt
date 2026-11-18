import { importGraph } from './imports.js';
import { bm25 } from './lexical.js';
import type { Scored, Snapshot } from './types.js';

/**
 * Personalized PageRank seeded with the lexical scores. Files that match the
 * prompt lend score to their imports and importers, so a component named in
 * the prompt pulls in the store it reads from even if the store never mentions
 * the prompt's words. `alpha` is the share of score that stays with the
 * lexical seed on each step.
 */
export type GraphOptions = { alpha?: number; hubPenalty?: number; iterations?: number };

export function graphRank(snapshot: Snapshot, seeds: Scored[], { alpha = 0.6, iterations = 20, hubPenalty = 0.5 }: GraphOptions = {}): Scored[] {
  const g = importGraph(snapshot);
  const total = seeds.reduce((s, x) => s + Math.max(x.score, 0), 0);
  if (total === 0) return seeds;
  const seed = new Map(seeds.map((s) => [s.path, Math.max(s.score, 0) / total]));
  let r = new Map(seed);
  for (let i = 0; i < iterations; i++) {
    const next = new Map<string, number>();
    for (const [p, v] of seed) next.set(p, alpha * v);
    for (const [p, neighbors] of g) {
      if (neighbors.size === 0) continue;
      // Hubs (utils imported everywhere) spread thinly; damping by degree^hubPenalty
      // keeps them from absorbing every query.
      const share = ((1 - alpha) * (r.get(p) ?? 0)) / Math.pow(neighbors.size, 1 + hubPenalty);
      for (const n of neighbors) next.set(n, (next.get(n) ?? 0) + share);
    }
    r = next;
  }
  return snapshot.files.map((f) => ({ path: f.path, score: r.get(f.path) ?? 0 }));
}

export type Method = 'bm25' | 'bm25+graph';

export function rank(snapshot: Snapshot, prompt: string, method: Method, graph: GraphOptions = {}): Scored[] {
  const lexical = bm25(snapshot.files, prompt);
  const scored = method === 'bm25' ? lexical : graphRank(snapshot, lexical, graph);
  return [...scored].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}
