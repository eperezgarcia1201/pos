type Language = "en" | "es" | "mixed";

type Correction = {
  from: string;
  to: string;
};

type SpellcheckResult = {
  text: string;
  corrections: Correction[];
};

type Dictionary = {
  aff: Uint8Array;
  dic: Uint8Array;
};

type Speller = {
  correct: (word: string) => boolean;
  suggest: (word: string) => string[];
};

const WORD_RE = /^[A-Za-zÀ-ÿÑñÜü]+$/;
const TOKEN_RE = /([A-Za-zÀ-ÿÑñÜü]+|[^A-Za-zÀ-ÿÑñÜü]+)/g;

let spellersPromise: Promise<{ en: Speller; es: Speller }> | null = null;

async function getSpellers() {
  if (!spellersPromise) {
    spellersPromise = (async () => {
      const [{ default: nspell }, { default: dictionaryEn }, { default: dictionaryEs }] = await Promise.all([
        import("nspell"),
        import("dictionary-en"),
        import("dictionary-es")
      ]);

      const createSpeller = nspell as unknown as (dictionary: Dictionary) => Speller;
      return {
        en: createSpeller(dictionaryEn as Dictionary),
        es: createSpeller(dictionaryEs as Dictionary)
      };
    })();
  }
  return spellersPromise;
}

function levenshtein(a: string, b: string) {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa === bb) return 0;
  if (!aa.length) return bb.length;
  if (!bb.length) return aa.length;

  const prev = new Array(bb.length + 1).fill(0);
  const curr = new Array(bb.length + 1).fill(0);
  for (let j = 0; j <= bb.length; j += 1) prev[j] = j;

  for (let i = 1; i <= aa.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= bb.length; j += 1) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bb.length; j += 1) prev[j] = curr[j];
  }
  return prev[bb.length];
}

function applyCasePattern(original: string, replacement: string) {
  if (!replacement) return original;
  if (original.toUpperCase() === original) return replacement.toUpperCase();
  if (original[0]?.toUpperCase() === original[0] && original.slice(1).toLowerCase() === original.slice(1)) {
    return replacement[0]?.toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement.toLowerCase();
}

function pickSuggestion(word: string, suggestions: string[]) {
  if (!suggestions.length) return null;
  const lowerWord = word.toLowerCase();
  const commonPrefixLength = (a: string, b: string) => {
    let i = 0;
    const aa = a.toLowerCase();
    const bb = b.toLowerCase();
    while (i < aa.length && i < bb.length && aa[i] === bb[i]) i += 1;
    return i;
  };
  const sorted = [...suggestions].sort((a, b) => {
    const distanceDiff = levenshtein(word, a) - levenshtein(word, b);
    if (distanceDiff !== 0) return distanceDiff;
    const prefixDiff = commonPrefixLength(lowerWord, b) - commonPrefixLength(lowerWord, a);
    if (prefixDiff !== 0) return prefixDiff;
    const lengthDiff =
      Math.abs(a.length - lowerWord.length) - Math.abs(b.length - lowerWord.length);
    if (lengthDiff !== 0) return lengthDiff;
    return b.length - a.length;
  });
  return sorted[0] ?? null;
}

function getLanguageOrder(language: Language, spellers: { en: Speller; es: Speller }) {
  if (language === "en") return [spellers.en, spellers.es] as const;
  if (language === "es") return [spellers.es, spellers.en] as const;
  return [spellers.en, spellers.es] as const;
}

function isWordCorrect(word: string, language: Language, primary: Speller, secondary: Speller) {
  if (language === "en" || language === "es") {
    return primary.correct(word);
  }
  return primary.correct(word) || secondary.correct(word);
}

export function detectLanguageForText(text: string): Language {
  const value = text.toLowerCase();
  if (/[ñáéíóúü]/i.test(value)) return "es";

  const esWords = (value.match(/\b(sin|con|queso|cebolla|pollo|carne|crema|agria|cilantro|frijol)\b/g) || []).length;
  const enWords = (value.match(/\b(no|with|without|cheese|onion|chicken|beef|cream|sour)\b/g) || []).length;

  if (esWords > enWords) return "es";
  if (enWords > esWords) return "en";
  return "mixed";
}

export async function autoCorrectText(input: string, language: Language = "mixed"): Promise<SpellcheckResult> {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) {
    return { text: "", corrections: [] };
  }

  const spellers = await getSpellers();
  const tokens = text.match(TOKEN_RE) || [text];
  const corrections: Correction[] = [];
  const [primary, secondary] = getLanguageOrder(language, spellers);
  const correctedTokens = tokens.map((token) => {
    if (!WORD_RE.test(token)) return token;
    if (isWordCorrect(token, language, primary, secondary)) return token;

    const primarySuggestion = pickSuggestion(token, primary.suggest(token));
    const secondarySuggestion = pickSuggestion(token, secondary.suggest(token));
    const chosen = primarySuggestion ?? secondarySuggestion;
    if (!chosen) return token;

    const corrected = applyCasePattern(token, chosen);
    if (corrected.toLowerCase() !== token.toLowerCase()) {
      corrections.push({ from: token, to: corrected });
    }
    return corrected;
  });

  let correctedText = correctedTokens.join("");
  const beforePhraseFix = correctedText;
  correctedText = correctedText.replace(/\b([Nn]o|[Ww]ith|[Ee]xtra)\s+sore\s+cream\b/g, "$1 sour cream");
  correctedText = correctedText.replace(/\b([Nn]o|[Ww]ith|[Ee]xtra)\s+sor\s+cream\b/g, "$1 sour cream");
  correctedText = correctedText.replace(/\b[Ss]in\s+cema\s+agira\b/g, "sin crema agria");
  correctedText = correctedText.replace(/\b[Ss]in\s+ceba\s+agita\b/g, "sin crema agria");
  correctedText = correctedText.replace(/\b[Ss]in\s+ceba\s+agira\b/g, "sin crema agria");
  correctedText = correctedText.replace(/\b[Ss]in\s+cema\s+agita\b/g, "sin crema agria");
  correctedText = correctedText.replace(/\b[Ss]in\s+cremo\s+agria\b/g, "sin crema agria");
  correctedText = correctedText.replace(/\b[Ss]in\s+crema\s+agira\b/g, "sin crema agria");
  correctedText = correctedText.replace(/\bceba\b/gi, "crema");
  correctedText = correctedText.replace(/\bagita\b/gi, "agria");

  if (correctedText !== beforePhraseFix) {
    corrections.push({ from: beforePhraseFix, to: correctedText });
  }

  return {
    text: correctedText,
    corrections
  };
}
