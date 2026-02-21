import { apiFetch } from "./api";

export type Language = "en" | "es" | "mixed";

type Correction = {
  from: string;
  to: string;
};

export type SpellcheckResult = {
  text: string;
  corrections: Correction[];
  language?: Language;
};

function applyLocalCorrections(input: string, language: Language): SpellcheckResult {
  let text = input;
  const corrections: Correction[] = [];

  const replacePattern = (pattern: RegExp, replacement: string | ((substring: string, ...args: string[]) => string)) => {
    const next = text.replace(pattern, replacement as never);
    if (next !== text) {
      corrections.push({ from: text, to: next });
      text = next;
    }
  };

  // High-confidence restaurant phrase corrections.
  replacePattern(/\b([Nn]o|[Ww]ith|[Ee]xtra)\s+sor\s+cream\b/g, "$1 sour cream");
  replacePattern(/\b[Ss]in\s+cema\s+agira\b/g, "sin crema agria");
  replacePattern(/\b[Ss]in\s+ceba\s+agita\b/g, "sin crema agria");
  replacePattern(/\b[Ss]in\s+ceba\s+agira\b/g, "sin crema agria");
  replacePattern(/\b[Ss]in\s+cema\s+agita\b/g, "sin crema agria");
  replacePattern(/\b[Ss]in\s+cremo\s+agria\b/g, "sin crema agria");
  replacePattern(/\b[Ss]in\s+crema\s+agira\b/g, "sin crema agria");

  // High-confidence word corrections for POS food notes.
  if (language === "es" || language === "mixed") {
    replacePattern(/\bcema\b/gi, "crema");
    replacePattern(/\bceba\b/gi, "crema");
    replacePattern(/\bcremo\b/gi, "crema");
    replacePattern(/\bagira\b/gi, "agria");
    replacePattern(/\bagita\b/gi, "agria");
  }
  if (language === "en" || language === "mixed") {
    replacePattern(/\bsor(?=\s+cream\b)/gi, "sour");
  }

  return { text, corrections, language };
}

export function autoCorrectTextLocal(input: string, language: Language = "mixed"): SpellcheckResult {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return { text: "", corrections: [], language };
  return applyLocalCorrections(text, language);
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
    return { text: "", corrections: [], language };
  }

  const localFirst = autoCorrectTextLocal(text, language);
  try {
    const remote = await apiFetch("/spellcheck/autocorrect", {
      method: "POST",
      body: JSON.stringify({ text, language })
    });
    const remoteText = typeof remote?.text === "string" ? remote.text : text;
    const localAfterRemote = applyLocalCorrections(remoteText, language);
    return {
      text: localAfterRemote.text,
      corrections: [...(Array.isArray(remote?.corrections) ? remote.corrections : []), ...localAfterRemote.corrections],
      language: remote?.language ?? language
    };
  } catch {
    return localFirst;
  }
}
