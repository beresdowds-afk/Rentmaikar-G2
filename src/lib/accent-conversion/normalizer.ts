/**
 * Idiom / phrasing normaliser.
 *
 * Converts Nigerian, West African and Commonwealth English colloquialisms and
 * spellings into natural American English before the text is handed to the
 * voice engine. Purely presentational — it never changes meaning-critical
 * business terms (amounts, names, vehicle identifiers).
 */

export interface NormalizationResult {
  text: string;
  replacements: string[];
}

interface Rule {
  pattern: RegExp;
  replacement: string;
}

const PHRASE_RULES: Rule[] = [
  { pattern: /\bi am coming\b/gi, replacement: "I'll be right with you" },
  { pattern: /\bi'?m coming\b/gi, replacement: "I'll be right with you" },
  { pattern: /\bflash (my|your|his|her|the) line\b/gi, replacement: 'give me a call' },
  { pattern: /\bflash me\b/gi, replacement: 'give me a quick call' },
  { pattern: /\bhold ?-?up is heavy\b/gi, replacement: "there's heavy traffic" },
  { pattern: /\bthere is hold ?-?up\b/gi, replacement: "there's traffic" },
  { pattern: /\bgo-?slow\b/gi, replacement: 'traffic' },
  { pattern: /\bparticulars\b/gi, replacement: 'vehicle registration documents' },
  { pattern: /\bdo the needful\b/gi, replacement: 'take care of it' },
  { pattern: /\brevert back to me\b/gi, replacement: 'get back to me' },
  { pattern: /\brevert to me\b/gi, replacement: 'get back to me' },
  { pattern: /\bkindly\b/gi, replacement: 'please' },
  { pattern: /\bplease find attached\b/gi, replacement: "I've attached" },
  { pattern: /\bi will branch\b/gi, replacement: "I'll stop by" },
  { pattern: /\bhow far\b/gi, replacement: 'how are you doing' },
  { pattern: /\bwell done\b/gi, replacement: 'good to hear from you' },
  { pattern: /\bnow now\b/gi, replacement: 'right away' },
  { pattern: /\bjust now\b/gi, replacement: 'a moment ago' },
  { pattern: /\bsorry o\b/gi, replacement: "I'm sorry about that" },
  { pattern: /\bno wahala\b/gi, replacement: 'no problem' },
  { pattern: /\bwahala\b/gi, replacement: 'trouble' },
  { pattern: /\bna so\b/gi, replacement: "that's right" },
  { pattern: /\bmake i\b/gi, replacement: 'let me' },
  { pattern: /\babeg\b/gi, replacement: 'please' },
  { pattern: /\bi dey come\b/gi, replacement: "I'll be right back" },
  { pattern: /\bpick (the )?call\b/gi, replacement: 'answer the call' },
  { pattern: /\bdrop me\b/gi, replacement: 'drop me off' },
  { pattern: /\bcarry passengers?\b/gi, replacement: 'pick up passengers' },
  { pattern: /\bfuel scarcity\b/gi, replacement: 'a gas shortage' },
  { pattern: /\bpetrol\b/gi, replacement: 'gas' },
  { pattern: /\bboot of the car\b/gi, replacement: 'trunk' },
  { pattern: /\bbonnet\b/gi, replacement: 'hood' },
  { pattern: /\bwind ?screen\b/gi, replacement: 'windshield' },
  { pattern: /\bindicator\b/gi, replacement: 'turn signal' },
  { pattern: /\bnumber plate\b/gi, replacement: 'license plate' },
  { pattern: /\bmotor park\b/gi, replacement: 'parking lot' },
  { pattern: /\bmechanic workshop\b/gi, replacement: 'repair shop' },
  { pattern: /\bcurrent\b(?= is (off|out|back))/gi, replacement: 'power' },
  { pattern: /\bnetwork is bad\b/gi, replacement: "the connection is poor" },
  { pattern: /\bon (a )?seat\b/gi, replacement: 'seated' },
  { pattern: /\bsomehow\b/gi, replacement: 'a little unusual' },
  { pattern: /\bmobile (phone )?number\b/gi, replacement: 'cell number' },
  { pattern: /\bpost ?code\b/gi, replacement: 'zip code' },
  { pattern: /\bqueue up\b/gi, replacement: 'line up' },
  { pattern: /\bin the queue\b/gi, replacement: 'in line' },
  { pattern: /\bcheque\b/gi, replacement: 'check' },
  { pattern: /\bhire purchase\b/gi, replacement: 'financing plan' },
  { pattern: /\bschedule an appointment for\b/gi, replacement: 'set up an appointment for' },
];

const SPELLING_RULES: Rule[] = [
  { pattern: /\bcancelled\b/gi, replacement: 'canceled' },
  { pattern: /\bcentre\b/gi, replacement: 'center' },
  { pattern: /\bcolour\b/gi, replacement: 'color' },
  { pattern: /\bfavourite\b/gi, replacement: 'favorite' },
  { pattern: /\bfavour\b/gi, replacement: 'favor' },
  { pattern: /\blicence\b/gi, replacement: 'license' },
  { pattern: /\bapologise\b/gi, replacement: 'apologize' },
  { pattern: /\borganise\b/gi, replacement: 'organize' },
  { pattern: /\bauthorised\b/gi, replacement: 'authorized' },
  { pattern: /\btravelling\b/gi, replacement: 'traveling' },
  { pattern: /\benquire\b/gi, replacement: 'inquire' },
  { pattern: /\benquiry\b/gi, replacement: 'inquiry' },
  { pattern: /\btyre\b/gi, replacement: 'tire' },
  { pattern: /\bkilometres?\b/gi, replacement: 'miles' },
  { pattern: /\bmobile phone\b/gi, replacement: 'cell phone' },
];

const ALL_RULES: Rule[] = [...PHRASE_RULES, ...SPELLING_RULES];

/** Preserve capitalisation of the original match where reasonable. */
function matchCase(source: string, replacement: string): string {
  if (!source) return replacement;
  const firstChar = source[0];
  if (firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Normalise a spoken utterance into American English phrasing.
 */
export function normalizeToAmerican(input: string): NormalizationResult {
  let text = input;
  const replacements: string[] = [];

  for (const rule of ALL_RULES) {
    text = text.replace(rule.pattern, (match) => {
      replacements.push(`${match.trim()} → ${rule.replacement}`);
      return matchCase(match, rule.replacement);
    });
  }

  // Tidy whitespace and duplicated punctuation left behind by substitutions.
  text = text.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();

  return { text, replacements };
}

/** True when the utterance looks like a complete clause worth speaking. */
export function isSpeakableClause(text: string, clauseStreaming: boolean): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  if (!clauseStreaming) return /[.!?]$/.test(trimmed) || trimmed.split(/\s+/).length >= 8;
  return trimmed.split(/\s+/).length >= 3 || /[,.;!?]$/.test(trimmed);
}
