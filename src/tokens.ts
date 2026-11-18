import { Tiktoken } from 'js-tiktoken/lite';
import o200k from 'js-tiktoken/ranks/o200k_base';

/**
 * Token counts with OpenAI's o200k encoding. Claude's tokenizer isn't public,
 * so this is an approximation; it's applied identically to every method, so
 * comparisons hold even where absolute numbers drift by some percent.
 */
let enc: Tiktoken | undefined;
const cache = new Map<string, number>();

export function countTokens(text: string): number {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  enc ??= new Tiktoken(o200k);
  const n = enc.encode(text, [], []).length;
  if (cache.size > 50_000) cache.clear();
  cache.set(text, n);
  return n;
}
