// KeyHelp's byte shorthand: K, M, G, T, P with 1024 steps, integers only ("1G", "500M").

const FACTORS: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4, P: 1024 ** 5 };

/** Parses "1G", "500M", "1048576" or "" (unlimited, returns 0); returns null for anything else. */
export function parseByteShorthand(input: string): number | null {
  const trimmed = input.trim().toUpperCase().replace(/I?B$/, '');
  if (trimmed === '') return 0;
  const match = /^(\d+)\s*([KMGTP]?)$/.exec(trimmed);
  if (!match) return null;
  const value = Number(match[1]) * FACTORS[match[2]];
  return Number.isSafeInteger(value) ? value : null;
}
