// Single source of truth for languages users can pick (native, learning, translation target).
// `code` is the ISO-style code sent to providers. `myMemory` marks languages MyMemory is
// known to accept; unsupported ones simply skip the fallback and rely on Gemini.
// Keep this list in sync with frontend/src/constants/index.js (TRANSLATION_LANGUAGES).
export const SUPPORTED_LANGUAGES = Object.freeze([
  { name: "English", code: "en", myMemory: true },
  { name: "Hindi", code: "hi", myMemory: true },
  { name: "Marathi", code: "mr", myMemory: true },
  { name: "Gujarati", code: "gu", myMemory: true },
  { name: "Bengali", code: "bn", myMemory: true },
  { name: "Tamil", code: "ta", myMemory: true },
  { name: "Telugu", code: "te", myMemory: true },
  { name: "Kannada", code: "kn", myMemory: true },
  { name: "Malayalam", code: "ml", myMemory: true },
  { name: "Punjabi", code: "pa", myMemory: true },
  { name: "Odia", code: "or", myMemory: true },
  { name: "Assamese", code: "as", myMemory: true },
  { name: "Urdu", code: "ur", myMemory: true },
  { name: "Sanskrit", code: "sa", myMemory: true },
  { name: "Sindhi", code: "sd", myMemory: true },
  { name: "Kashmiri", code: "ks", myMemory: false },
  { name: "Konkani", code: "kok", myMemory: false },
  { name: "Manipuri", code: "mni", myMemory: false },
  { name: "Bodo", code: "brx", myMemory: false },
  { name: "Dogri", code: "doi", myMemory: false },
  { name: "Santali", code: "sat", myMemory: false },
  { name: "Spanish", code: "es", myMemory: true },
  { name: "French", code: "fr", myMemory: true },
  { name: "German", code: "de", myMemory: true },
  { name: "Mandarin", code: "zh", myMemory: true },
  { name: "Japanese", code: "ja", myMemory: true },
  { name: "Korean", code: "ko", myMemory: true },
  { name: "Russian", code: "ru", myMemory: true },
  { name: "Portuguese", code: "pt", myMemory: true },
  { name: "Arabic", code: "ar", myMemory: true },
  { name: "Italian", code: "it", myMemory: true },
  { name: "Turkish", code: "tr", myMemory: true },
  { name: "Dutch", code: "nl", myMemory: true },
]);

const ALIASES = { chinese: "zh", "mandarin chinese": "zh", odia: "or", oriya: "or" };

/**
 * Resolve a user-supplied language (name, code, or alias) to a supported entry.
 * Returns null for anything unsupported. Never trusts the raw value beyond matching.
 */
export const resolveLanguage = (value) => {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  const code = ALIASES[key] || key;
  return (
    SUPPORTED_LANGUAGES.find((l) => l.name.toLowerCase() === key || l.code === code) || null
  );
};

export const languageByCode = (code) => SUPPORTED_LANGUAGES.find((l) => l.code === code) || null;
