/**
 * Real-time Speech Accent and Idiom Normalizer
 *
 * Converts regional Nigerian / West African and Commonwealth speech expressions
 * into standard, natural, conversational American English idioms and vocabulary.
 */

interface IdiomReplacement {
  pattern: RegExp;
  replacement: string;
  originalLabel: string;
  americanLabel: string;
}

const IDIOM_RULES: IdiomReplacement[] = [
  // Common conversational idioms
  {
    pattern: /\b(?:i\s+am|i'm)\s+coming\b/gi,
    replacement: "I'll be right with you",
    originalLabel: "I am coming",
    americanLabel: "I'll be right with you",
  },
  {
    pattern: /\b(?:flash|flash\s+my|flash\s+me)\s*(?:phone|line|number)?\b/gi,
    replacement: "give me a quick call",
    originalLabel: "flash me",
    americanLabel: "give me a quick call",
  },
  {
    pattern: /\bput\s+off\s+(?:the\s+)?(?:engine|car|motor|vehicle)\b/gi,
    replacement: "turn off the engine",
    originalLabel: "put off the engine",
    americanLabel: "turn off the engine",
  },
  {
    pattern: /\bput\s+on\s+(?:the\s+)?(?:engine|car|motor|vehicle|ac|a\/c)\b/gi,
    replacement: "turn on the engine",
    originalLabel: "put on the engine",
    americanLabel: "turn on the engine",
  },
  {
    pattern: /\bhold\s*up\s+is\s+heavy\b/gi,
    replacement: "there is heavy traffic",
    originalLabel: "hold up is heavy",
    americanLabel: "there is heavy traffic",
  },
  {
    pattern: /\b(?:go-slow|go\s+slow)\b/gi,
    replacement: "traffic delay",
    originalLabel: "go-slow",
    americanLabel: "traffic delay",
  },
  {
    pattern: /\b(?:borrow\s+me)\b/gi,
    replacement: "lend me",
    originalLabel: "borrow me",
    americanLabel: "lend me",
  },
  {
    pattern: /\brevert\s+back\b/gi,
    replacement: "get back to you",
    originalLabel: "revert back",
    americanLabel: "get back to you",
  },
  {
    pattern: /\bcan\s+you\s+hear\s+me\s+well\??\b/gi,
    replacement: "can you hear me clearly?",
    originalLabel: "can you hear me well?",
    americanLabel: "can you hear me clearly?",
  },
  {
    pattern: /\bdrop\s+me\s+at\s+the\s+junction\b/gi,
    replacement: "drop me off at the intersection",
    originalLabel: "drop me at the junction",
    americanLabel: "drop me off at the intersection",
  },
  {
    pattern: /\bthe\s+junction\b/gi,
    replacement: "the intersection",
    originalLabel: "the junction",
    americanLabel: "the intersection",
  },
  {
    pattern: /\byour\s+particulars\b/gi,
    replacement: "your vehicle registration documents",
    originalLabel: "your particulars",
    americanLabel: "your vehicle registration documents",
  },
  {
    pattern: /\btear-rubber\s+car\b/gi,
    replacement: "brand new vehicle",
    originalLabel: "tear-rubber car",
    americanLabel: "brand new vehicle",
  },
  {
    pattern: /\b(?:enter\s+the\s+motor|board\s+the\s+motor)\b/gi,
    replacement: "get in the vehicle",
    originalLabel: "enter the motor",
    americanLabel: "get in the vehicle",
  },
  {
    pattern: /\b(?:driver\s+is\s+on\s+ground)\b/gi,
    replacement: "driver is on site",
    originalLabel: "driver is on ground",
    americanLabel: "driver is on site",
  },
  {
    pattern: /\b(?:i\s+am\s+on\s+ground)\b/gi,
    replacement: "I am already on site",
    originalLabel: "I am on ground",
    americanLabel: "I am already on site",
  },
  {
    pattern: /\b(?:send\s+me\s+airtime)\b/gi,
    replacement: "top up my phone credit",
    originalLabel: "send me airtime",
    americanLabel: "top up my phone credit",
  },
  {
    pattern: /\b(?:light\s+has\s+come)\b/gi,
    replacement: "power is restored",
    originalLabel: "light has come",
    americanLabel: "power is restored",
  },
  {
    pattern: /\b(?:chanced)\b/gi,
    replacement: "have time",
    originalLabel: "chanced",
    americanLabel: "have time",
  },
  {
    pattern: /\b(?:round\s+up)\b/gi,
    replacement: "wrap up",
    originalLabel: "round up",
    americanLabel: "wrap up",
  },
  {
    pattern: /\b(?:rub\s+minds)\b/gi,
    replacement: "brainstorm together",
    originalLabel: "rub minds",
    americanLabel: "brainstorm together",
  },
  {
    pattern: /\b(?:safe\s+journey)\b/gi,
    replacement: "safe travels",
    originalLabel: "safe journey",
    americanLabel: "safe travels",
  },
  // Automotive & transport terms
  {
    pattern: /\bbonnet\b/gi,
    replacement: "hood",
    originalLabel: "bonnet",
    americanLabel: "hood",
  },
  {
    pattern: /\bboot\b/gi,
    replacement: "trunk",
    originalLabel: "boot",
    americanLabel: "trunk",
  },
  {
    pattern: /\bwindscreen\b/gi,
    replacement: "windshield",
    originalLabel: "windscreen",
    americanLabel: "windshield",
  },
  {
    pattern: /\btyre\b/gi,
    replacement: "tire",
    originalLabel: "tyre",
    americanLabel: "tire",
  },
  {
    pattern: /\bpetrol\b/gi,
    replacement: "gas",
    originalLabel: "petrol",
    americanLabel: "gas",
  },
  {
    pattern: /\blorry\b/gi,
    replacement: "truck",
    originalLabel: "lorry",
    americanLabel: "truck",
  },
  {
    pattern: /\bparking\s+lot\b/gi,
    replacement: "parking lot",
    originalLabel: "car park",
    americanLabel: "parking lot",
  },
  {
    pattern: /\bcar\s+park\b/gi,
    replacement: "parking lot",
    originalLabel: "car park",
    americanLabel: "parking lot",
  },
  {
    pattern: /\bmotorway\b/gi,
    replacement: "freeway",
    originalLabel: "motorway",
    americanLabel: "freeway",
  },
  {
    pattern: /\bdual\s+carriageway\b/gi,
    replacement: "divided highway",
    originalLabel: "dual carriageway",
    americanLabel: "divided highway",
  },
  {
    pattern: /\broundabout\b/gi,
    replacement: "traffic circle",
    originalLabel: "roundabout",
    americanLabel: "traffic circle",
  },
];

export interface TransformResult {
  americanText: string;
  adapted: boolean;
  replacements: { original: string; american: string }[];
}

/**
 * Normalizes input text into standard American English phrasing and vocabulary.
 */
export function normalizeToAmericanAccent(
  text: string,
  enableIdiomAdaptation = true
): TransformResult {
  if (!text || !text.trim()) {
    return { americanText: "", adapted: false, replacements: [] };
  }

  let result = text.trim();
  const matchedReplacements: { original: string; american: string }[] = [];

  if (enableIdiomAdaptation) {
    for (const rule of IDIOM_RULES) {
      if (rule.pattern.test(result)) {
        result = result.replace(rule.pattern, rule.replacement);
        matchedReplacements.push({
          original: rule.originalLabel,
          american: rule.americanLabel,
        });
      }
    }
  }

  // Capitalize first character and ensure punctuation
  result = result.charAt(0).toUpperCase() + result.slice(1);
  if (!/[.!?]$/.test(result)) {
    result += ".";
  }

  return {
    americanText: result,
    adapted: matchedReplacements.length > 0,
    replacements: matchedReplacements,
  };
}
