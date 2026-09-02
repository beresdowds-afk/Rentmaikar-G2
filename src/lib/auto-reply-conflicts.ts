import type { AutoReplyRule } from '@/hooks/useCannedReplies';

export type MatchType = 'any' | 'all' | 'exact';

const norm = (v?: string | null) => (v || '').toLowerCase().trim();

/** Keywords shared by two rules (case-insensitive). */
export const sharedKeywords = (a: AutoReplyRule, b: AutoReplyRule): string[] => {
  const setB = new Set((b.keywords || []).map(norm).filter(Boolean));
  return Array.from(new Set((a.keywords || []).map(norm).filter(Boolean))).filter((k) =>
    setB.has(k),
  );
};

/** Two scopes overlap when either side is "any" or both are equal. */
export const scopesOverlap = (a: AutoReplyRule, b: AutoReplyRule): boolean => {
  const channelOverlap = !a.channel || !b.channel || norm(a.channel) === norm(b.channel);
  const regionOverlap = !a.region || !b.region || norm(a.region) === norm(b.region);
  return channelOverlap && regionOverlap;
};

export interface RuleConflict {
  otherId: string;
  otherName: string;
  keywords: string[];
  /** True when this rule outranks the other for the shared keywords. */
  wins: boolean;
}

/** Ordering used by the engine: lowest priority number first, then name. */
export const byEnginePriority = (a: AutoReplyRule, b: AutoReplyRule) =>
  (a.priority ?? 100) - (b.priority ?? 100) || a.name.localeCompare(b.name);

/** All rules that can match the same message as `rule`. */
export const conflictsForRule = (rule: AutoReplyRule, rules: AutoReplyRule[]): RuleConflict[] => {
  const ordered = [...rules].sort(byEnginePriority);
  const myIndex = ordered.findIndex((r) => r.id === rule.id);

  return ordered
    .filter((other) => other.id !== rule.id && other.is_active && rule.is_active)
    .map((other) => {
      const keywords = sharedKeywords(rule, other);
      if (keywords.length === 0 || !scopesOverlap(rule, other)) return null;
      const otherIndex = ordered.findIndex((r) => r.id === other.id);
      return {
        otherId: other.id,
        otherName: other.name,
        keywords,
        wins: myIndex < otherIndex,
      } as RuleConflict;
    })
    .filter((c): c is RuleConflict => c !== null);
};

/** Total number of conflicting rule pairs across the whole set. */
export const conflictPairCount = (rules: AutoReplyRule[]): number => {
  let count = 0;
  for (let i = 0; i < rules.length; i += 1) {
    for (let j = i + 1; j < rules.length; j += 1) {
      const a = rules[i];
      const b = rules[j];
      if (!a.is_active || !b.is_active) continue;
      if (sharedKeywords(a, b).length > 0 && scopesOverlap(a, b)) count += 1;
    }
  }
  return count;
};

const matchedKeywords = (rule: AutoReplyRule, text: string): string[] => {
  const haystack = norm(text);
  if (!haystack) return [];
  const keywords = (rule.keywords || []).map(norm).filter(Boolean);
  if (keywords.length === 0) return [];
  switch (rule.match_type) {
    case 'exact':
      return keywords.filter((k) => haystack === k);
    case 'all':
      return keywords.every((k) => haystack.includes(k)) ? keywords : [];
    default:
      return keywords.filter((k) => haystack.includes(k));
  }
};

export interface SimulationHit {
  rule: AutoReplyRule;
  keywords: string[];
  /** First hit wins; the rest are shadowed. */
  winner: boolean;
}

/**
 * Mirrors the server engine: filter by channel/region, evaluate in priority
 * order, first active match wins and every later match is shadowed.
 */
export const simulateAutoReply = (
  rules: AutoReplyRule[],
  message: string,
  scope: { channel?: string | null; region?: string | null } = {},
): SimulationHit[] => {
  const hits: SimulationHit[] = [];
  const ordered = [...rules].sort(byEnginePriority);

  for (const rule of ordered) {
    if (!rule.is_active) continue;
    if (rule.channel && scope.channel && norm(rule.channel) !== norm(scope.channel)) continue;
    if (rule.region && scope.region && norm(rule.region) !== norm(scope.region)) continue;
    const keywords = matchedKeywords(rule, message);
    if (keywords.length === 0) continue;
    hits.push({ rule, keywords, winner: hits.length === 0 });
  }

  return hits;
};
