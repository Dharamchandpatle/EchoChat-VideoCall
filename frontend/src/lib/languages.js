import { TRANSLATION_LANGUAGES } from "../constants";

const ALIASES = { chinese: "zh", "mandarin chinese": "zh", oriya: "or" };

// Accepts a language name or code (case-insensitive) and returns { name, code } or null.
export const findLanguage = (value) => {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  const code = ALIASES[key] || key;
  return TRANSLATION_LANGUAGES.find((l) => l.name.toLowerCase() === key || l.code === code) || null;
};

export const nameForCode = (code) => TRANSLATION_LANGUAGES.find((l) => l.code === code)?.name || code;
