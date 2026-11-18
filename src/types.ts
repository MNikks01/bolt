export type SourceFile = { path: string; text: string };

/** A repository at one commit, as the selector sees it. */
export type Snapshot = {
  files: SourceFile[];
  /** tsconfig `paths` aliases, e.g. { "~/": "app/" }. */
  aliases: Record<string, string>;
};

export type Scored = { path: string; score: number };

export type Selection = {
  /** Included verbatim. */
  full: string[];
  /** Included as declarations only (no bodies). */
  signatures: string[];
  tokens: number;
  /** What was sent, ready to paste into a prompt. */
  context: string;
};
