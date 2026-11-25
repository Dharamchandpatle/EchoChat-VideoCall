import crypto from "crypto";
import TranslationCache from "../models/TranslationCache.js";
import { AiError, generateText, toAiError } from "./geminiService.js";
import { languageByCode } from "../lib/supportedLanguages.js";

export const MAX_TEXT_LENGTH = 2000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MYMEMORY_TIMEOUT_MS = 8000;

export class TranslationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---- Providers ------------------------------------------------------------
// Each provider returns { translation, detectedCode } or null (unsupported / no result),
// and throws on provider failure. Exposed via setTranslationProviders for controlled tests.

const geminiTranslate = async ({ text, sourceCode, targetCode }) => {
  const target = languageByCode(targetCode);
  const source = sourceCode ? languageByCode(sourceCode) : null;
  const system = [
    "You are a professional translator for a chat app between people learning Indian languages.",
    "Preserve the meaning, tone, politeness level, emojis, names, numbers and punctuation.",
    "Translate conversational language naturally; do not translate literally word-for-word.",
    `Target language: ${target.name} (${target.code}).`,
    'Reply with JSON only, exactly: {"detected_language_code": "<ISO code of the source text or unknown>", "translation": "<translated text>"}',
  ].join("\n");
  const sourceHint = source
    ? `The text is probably in ${source.name}, but verify it.`
    : "Detect the source language yourself.";

  const raw = await generateText({
    system,
    user: `${sourceHint}\n<text>\n${text}\n</text>`,
    json: true,
    maxOutputTokens: 1024,
  });
  return parseGeminiJson(raw);
};

// Gemini is asked for JSON, but tolerate code fences and plain-text replies.
export const parseGeminiJson = (raw) => {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = null;
  }

  // Not JSON: the whole reply is the translation and detection is unknown.
  if (!parsed || typeof parsed !== "object") {
    if (!cleaned) throw new TranslationError(503, "EMPTY_RESULT", "Translation service returned an empty result");
    return { translation: cleaned, detectedCode: null };
  }

  const translation = typeof parsed.translation === "string" ? parsed.translation.trim() : "";
  if (!translation) throw new TranslationError(503, "EMPTY_RESULT", "Translation service returned an empty result");
  const detected = typeof parsed.detected_language_code === "string" ? parsed.detected_language_code.trim().toLowerCase() : "";
  return { translation, detectedCode: languageByCode(detected) ? detected : null };
};

// MyMemory's anonymous tier is limited per day. The budget is configurable and tracked per process.
const MYMEMORY_DAILY_CHAR_LIMIT = Number(process.env.MYMEMORY_DAILY_CHAR_LIMIT) || 5000;
let myMemoryUsage = { day: "", chars: 0 };
export const reserveMyMemoryChars = (count, now = new Date()) => {
  const day = now.toISOString().slice(0, 10);
  if (myMemoryUsage.day !== day) myMemoryUsage = { day, chars: 0 };
  if (myMemoryUsage.chars + count > MYMEMORY_DAILY_CHAR_LIMIT) return false;
  myMemoryUsage.chars += count;
  return true;
};
export const resetMyMemoryBudget = () => {
  myMemoryUsage = { day: "", chars: 0 };
};

const MYMEMORY_ERROR_PATTERN = /INVALID|QUERY LENGTH|MYMEMORY WARNING|PLEASE SELECT|NO QUERY/i;

const myMemoryTranslate = async ({ text, sourceCode, targetCode }) => {
  const target = languageByCode(targetCode);
  if (!target?.myMemory) return null;
  const source = sourceCode ? languageByCode(sourceCode) : null;
  if (source && !source.myMemory) return null;
  if (!reserveMyMemoryChars(text.length)) return null; // daily budget exhausted

  const pair = `${source ? source.code : "autodetect"}|${target.code}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(MYMEMORY_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`MyMemory HTTP ${response.status}`);
  const data = await response.json();
  const translation = data?.responseData?.translatedText;
  if (!translation || MYMEMORY_ERROR_PATTERN.test(translation)) return null;
  return { translation: translation.trim(), detectedCode: null };
};

let providers = { gemini: geminiTranslate, mymemory: myMemoryTranslate };

export const setTranslationProviders = (overrides) => {
  providers = { ...providers, ...overrides };
};

export const resetTranslationProviders = () => {
  providers = { gemini: geminiTranslate, mymemory: myMemoryTranslate };
};

// ---- Caching and de-duplication --------------------------------------------

export const cacheKey = (text, sourceCode, targetCode) =>
  crypto.createHash("sha256").update(`${sourceCode || "auto"}|${targetCode}|${text}`).digest("hex");

// Identical requests that are already running share one provider call.
const inflight = new Map();

const toResponse = (text, targetCode, sourceCode, result) => ({
  translatedText: result.translatedText,
  detectedCode: result.detectedCode ?? null,
  provider: result.provider,
  cached: Boolean(result.cached),
  originalText: text,
  sourceCode: sourceCode || result.detectedCode || null,
  targetCode,
});

/**
 * Translate a message. sourceCode null means auto-detect.
 * Returns { originalText, translatedText, sourceCode, detectedCode, targetCode, provider, cached }.
 */
export const translateText = async ({ text, sourceCode = null, targetCode }) => {
  if (typeof text !== "string" || !text.trim()) {
    throw new TranslationError(400, "EMPTY_TEXT", "Text is required");
  }
  const cleanText = text.trim();
  if (cleanText.length > MAX_TEXT_LENGTH) {
    throw new TranslationError(400, "TEXT_TOO_LONG", `Text must be ${MAX_TEXT_LENGTH} characters or fewer`);
  }
  if (!languageByCode(targetCode)) {
    throw new TranslationError(400, "UNSUPPORTED_TARGET", "Target language is not supported");
  }

  // Same source and target: nothing to translate, no provider call.
  if (sourceCode && sourceCode === targetCode) {
    return toResponse(cleanText, targetCode, sourceCode, {
      translatedText: cleanText,
      detectedCode: targetCode,
      provider: "none",
    });
  }

  const key = cacheKey(cleanText, sourceCode, targetCode);
  if (inflight.has(key)) {
    const shared = await inflight.get(key);
    return toResponse(cleanText, targetCode, sourceCode, { ...shared, cached: true });
  }

  const work = (async () => {
    const hit = await TranslationCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
    if (hit) {
      return { translatedText: hit.translatedText, detectedCode: hit.detectedLanguage, provider: hit.provider, cached: true };
    }
    const result = await runProviders({ text: cleanText, sourceCode, targetCode });
    try {
      await TranslationCache.updateOne(
        { key },
        {
          $set: {
            sourceLanguage: sourceCode || "auto",
            targetLanguage: targetCode,
            detectedLanguage: result.detectedCode,
            originalText: cleanText,
            translatedText: result.translatedText,
            provider: result.provider,
            expiresAt: new Date(Date.now() + CACHE_TTL_MS),
          },
        },
        { upsert: true }
      );
    } catch (error) {
      // Cache failures must never block a successful translation.
      console.warn("Translation cache write failed:", error.message);
    }
    return result;
  })();

  inflight.set(key, work);
  try {
    const result = await work;
    return toResponse(cleanText, targetCode, sourceCode, result);
  } finally {
    inflight.delete(key);
  }
};

// Gemini first; MyMemory fallback. Errors are classified so the caller can return a precise status.
const runProviders = async ({ text, sourceCode, targetCode }) => {
  let geminiError = null;
  try {
    const out = await providers.gemini({ text, sourceCode, targetCode });
    if (out?.translation) return { translatedText: out.translation, detectedCode: out.detectedCode, provider: "gemini", cached: false };
  } catch (error) {
    geminiError = toAiError(error);
    console.warn(`Gemini translation failed (${geminiError.code}); trying MyMemory.`);
  }

  try {
    const out = await providers.mymemory({ text, sourceCode, targetCode });
    if (out?.translation) return { translatedText: out.translation, detectedCode: out.detectedCode, provider: "mymemory", cached: false };
  } catch (error) {
    console.warn("MyMemory translation failed:", error.message);
  }

  if (geminiError?.code === "QUOTA_EXCEEDED") {
    throw new TranslationError(429, "RATE_LIMITED", "Translation service is busy. Please try again in a moment.");
  }
  if (geminiError?.code === "NOT_CONFIGURED") {
    throw new TranslationError(503, "NOT_CONFIGURED", "Translation is not configured on the server");
  }
  throw new TranslationError(503, "PROVIDERS_UNAVAILABLE", "Translation is temporarily unavailable. Please try again.");
};
