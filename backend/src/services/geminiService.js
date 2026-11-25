// Single Gemini integration for the whole backend. Every AI feature calls this module; no
// controller or service creates its own client.
//
// Configuration (backend/.env, server only):
//   GEMINI_API_KEY  required for any AI feature
//   GEMINI_MODEL    optional; defaults to DEFAULT_MODEL (must be a model the key can use)
//   GEMINI_FALLBACK_MODELS  optional, comma-separated; tried in order when the primary model is
//                   overloaded, timing out, out of quota or retired. Defaults to DEFAULT_FALLBACK_MODELS.
//                   Set to "none" to disable fallback.
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

// Google recommends the maintained GenAI SDK and Gemini 3.8 Flash for new integrations.
export const DEFAULT_MODEL = "gemini-3.8-flash";
// The newest model is frequently overloaded (503 "high demand" / 504 deadline expired). These are
// generally-available models the same key can use; verified against the live API.
export const DEFAULT_FALLBACK_MODELS = Object.freeze(["gemini-3.5-flash", "gemini-3.5-flash-lite"]);
const MODEL_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,60}$/i;
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 15000;
// A model that failed with a transient error is tried last for this long, so users are not made to
// wait on an overloaded model for every request.
const MODEL_COOLDOWN_MS = 3 * 60 * 1000;
// Failures for which trying a different model can help. Bad credentials and network failures
// affect every model, so they are not retried.
// Gemini 3.x models "think" before answering and those tokens count against maxOutputTokens
// (measured: ~800 thinking tokens for a short grammar check). Callers state the budget for the visible
// answer; this headroom is added so thinking cannot crowd out the answer and truncate it.
const THINKING_HEADROOM_TOKENS = 2048;
const RETRYABLE_CODES = new Set(["MODEL_UNAVAILABLE", "QUOTA_EXCEEDED", "PROVIDER_UNAVAILABLE", "TIMEOUT"]);
const HEALTH_TTL_OK_MS = 5 * 60 * 1000;
const HEALTH_TTL_FAILED_MS = 60 * 1000;
const HEALTH_MIN_REFRESH_MS = 10 * 1000;

// Stable error codes. Callers map these to HTTP responses; provider details never leave the server.
export const AI_ERROR = Object.freeze({
  NOT_CONFIGURED: "NOT_CONFIGURED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  BAD_RESPONSE: "BAD_RESPONSE",
  UNKNOWN: "UNKNOWN",
});

const RESPONSE_STATUS = {
  NOT_CONFIGURED: 503,
  INVALID_CREDENTIALS: 503,
  MODEL_UNAVAILABLE: 503,
  QUOTA_EXCEEDED: 429,
  PROVIDER_UNAVAILABLE: 503,
  NETWORK_ERROR: 503,
  TIMEOUT: 504,
  BAD_RESPONSE: 502,
  UNKNOWN: 503,
};

const USER_MESSAGE = {
  NOT_CONFIGURED: "AI is not configured on the server yet.",
  INVALID_CREDENTIALS: "The Gemini API key was rejected. The administrator needs to update it.",
  MODEL_UNAVAILABLE: "The configured Gemini model is not available. The administrator needs to change GEMINI_MODEL.",
  QUOTA_EXCEEDED: "AI usage limit reached for now. Please try again shortly.",
  PROVIDER_UNAVAILABLE: "AI provider is temporarily unavailable. Please try again.",
  NETWORK_ERROR: "Could not reach the AI provider. Check the server's network connection.",
  TIMEOUT: "The AI provider took too long to respond. Please try again.",
  BAD_RESPONSE: "The AI response could not be used. Please try again.",
  UNKNOWN: "AI service temporarily unavailable.",
};

export class AiError extends Error {
  constructor(code, { cause } = {}) {
    super(USER_MESSAGE[code] || USER_MESSAGE.UNKNOWN);
    this.name = "AiError";
    this.code = code;
    this.httpStatus = RESPONSE_STATUS[code] || 503;
    this.userMessage = USER_MESSAGE[code] || USER_MESSAGE.UNKNOWN;
    if (cause) this.cause = cause;
  }
}

export const isConfigured = () => Boolean((process.env.GEMINI_API_KEY || "").trim());

// Returns the configured model name, or the default when GEMINI_MODEL is missing or malformed.
export const getModelName = () => {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  if (!configured) return DEFAULT_MODEL;
  if (!MODEL_NAME_PATTERN.test(configured)) {
    console.warn("GEMINI_MODEL is malformed; using the default model.");
    return DEFAULT_MODEL;
  }
  return configured;
};

// Ordered, de-duplicated list of models to try: the primary first, then the fallbacks.
export const getModelChain = () => {
  const primary = getModelName();
  const raw = process.env.GEMINI_FALLBACK_MODELS;
  let fallbacks;
  if (raw === undefined || !raw.trim()) fallbacks = DEFAULT_FALLBACK_MODELS;
  else if (raw.trim().toLowerCase() === "none") fallbacks = [];
  else fallbacks = raw.split(",").map((m) => m.trim()).filter((m) => MODEL_NAME_PATTERN.test(m));
  return [...new Set([primary, ...fallbacks])];
};

const modelCooldownUntil = new Map();
let lastServedModel = null;
export const resetModelCooldowns = () => {
  modelCooldownUntil.clear();
  lastServedModel = null;
};
export const getLastServedModel = () => lastServedModel;

// Models not cooling down keep their configured order; cooling-down models are still tried, last.
const orderedModels = (now = Date.now()) => {
  const chain = getModelChain();
  const ready = chain.filter((m) => !(modelCooldownUntil.get(m) > now));
  const cooling = chain.filter((m) => modelCooldownUntil.get(m) > now);
  return [...ready, ...cooling];
};

// Maps SDK, HTTP, and network failures to an AiError. Never copies the raw message into the AiError.
export const toAiError = (error) => {
  if (error instanceof AiError) return error;
  const status = error?.status ?? error?.response?.status;
  const text = String(error?.message || "");
  const causeCode = error?.cause?.code || error?.code;

  if (error?.name === "AbortError" || /timed? ?out|timeout/i.test(text)) return new AiError(AI_ERROR.TIMEOUT, { cause: error });
  if (/API key not valid|API_KEY_INVALID/i.test(text)) return new AiError(AI_ERROR.INVALID_CREDENTIALS, { cause: error });
  if (status === 401 || status === 403 || /PERMISSION_DENIED/i.test(text)) return new AiError(AI_ERROR.INVALID_CREDENTIALS, { cause: error });
  if (status === 404 || /is not found|no longer available|not supported for generateContent/i.test(text)) {
    return new AiError(AI_ERROR.MODEL_UNAVAILABLE, { cause: error });
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) return new AiError(AI_ERROR.QUOTA_EXCEEDED, { cause: error });
  if (status >= 500 || /UNAVAILABLE|high demand/i.test(text)) return new AiError(AI_ERROR.PROVIDER_UNAVAILABLE, { cause: error });
  if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT"].includes(causeCode) || /fetch failed/i.test(text)) {
    return new AiError(AI_ERROR.NETWORK_ERROR, { cause: error });
  }
  return new AiError(AI_ERROR.UNKNOWN, { cause: error });
};

// ---- Transport -------------------------------------------------------------
// The default transport talks to the real SDK. Tests replace it with setGeminiTransport.

let client = null;
let clientKey = null;

const defaultTransport = async ({ system, user, json, maxOutputTokens, model }) => {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new AiError(AI_ERROR.NOT_CONFIGURED);
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: REQUEST_TIMEOUT_MS },
    });
    clientKey = apiKey;
  }
  const response = await client.models.generateContent({
    model: model || getModelName(),
    contents: [{ role: "user", parts: [{ text: user }] }],
    config: {
      ...(system ? { systemInstruction: system } : {}),
      maxOutputTokens: maxOutputTokens + THINKING_HEADROOM_TOKENS,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  });
  // A reply cut off at the token limit is incomplete (and invalid JSON when JSON was requested).
  if (response?.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new AiError(AI_ERROR.BAD_RESPONSE);
  return response.text;
};

let transport = defaultTransport;
export const setGeminiTransport = (fn) => {
  transport = fn;
  resetModelCooldowns();
};
export const resetGeminiTransport = () => {
  transport = defaultTransport;
  resetModelCooldowns();
};

/**
 * Generate text. Throws AiError on any failure; never returns an empty string.
 * @param {{ system?: string, user: string, json?: boolean, maxOutputTokens?: number }} args
 */
export const generateText = async ({ system = "", user, json = false, maxOutputTokens = 1024 }) => {
  if (!isConfigured()) throw new AiError(AI_ERROR.NOT_CONFIGURED);
  const models = orderedModels();
  let lastError = null;
  for (const model of models) {
    let text;
    try {
      text = await transport({ system, user: String(user ?? ""), json, maxOutputTokens, model });
    } catch (error) {
      lastError = toAiError(error);
      if (!RETRYABLE_CODES.has(lastError.code)) throw lastError;
      modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
      if (models.length > 1) console.warn(`Gemini model ${model} failed (${lastError.code}); trying next model.`);
      continue;
    }
    const cleaned = typeof text === "string" ? text.trim() : "";
    if (!cleaned) throw new AiError(AI_ERROR.BAD_RESPONSE);
    modelCooldownUntil.delete(model);
    lastServedModel = model;
    return cleaned;
  }
  throw lastError || new AiError(AI_ERROR.UNKNOWN);
};

// ---- Health --------------------------------------------------------------------
// Reports what the provider actually does. "Configured" alone is not "available".

const HEALTH_STATUS_BY_CODE = {
  [AI_ERROR.NOT_CONFIGURED]: "not_configured",
  [AI_ERROR.INVALID_CREDENTIALS]: "invalid_credentials",
  [AI_ERROR.MODEL_UNAVAILABLE]: "model_unavailable",
  [AI_ERROR.QUOTA_EXCEEDED]: "quota_exceeded",
  [AI_ERROR.PROVIDER_UNAVAILABLE]: "provider_unavailable",
  [AI_ERROR.NETWORK_ERROR]: "network_error",
  [AI_ERROR.TIMEOUT]: "provider_unavailable",
  [AI_ERROR.BAD_RESPONSE]: "provider_unavailable",
  [AI_ERROR.UNKNOWN]: "provider_unavailable",
};

let healthCache = null; // { result, at, ttl }
let healthInflight = null;

const runHealthProbe = async () => {
  const configured = isConfigured();
  const model = getModelName();
  const fallbackModels = getModelChain().slice(1);
  const checkedAt = new Date().toISOString();
  if (!configured) {
    return { success: true, provider: "Google Gemini", configured: false, model, status: "not_configured", message: USER_MESSAGE.NOT_CONFIGURED, checkedAt };
  }
  try {
    await generateText({ user: "Reply with the single word OK.", maxOutputTokens: 256 });
    const servedBy = lastServedModel;
    return {
      success: true,
      provider: "Google Gemini",
      configured: true,
      model,
      fallbackModels,
      servedBy,
      degraded: servedBy !== model,
      status: "available",
      message: servedBy === model ? "AI is available." : `AI is available (primary model busy; using ${servedBy}).`,
      checkedAt,
    };
  } catch (error) {
    const err = toAiError(error);
    console.warn(`Gemini health check failed: ${err.code}`);
    return {
      success: true,
      provider: "Google Gemini",
      configured: true,
      model,
      fallbackModels,
      status: HEALTH_STATUS_BY_CODE[err.code] || "provider_unavailable",
      message: err.userMessage,
      checkedAt,
    };
  }
};

/**
 * Cached health check. Concurrent callers share one probe. A forced refresh is allowed at most
 * once every 10 seconds so the endpoint cannot be used to spend quota.
 */
export const getHealth = async ({ force = false } = {}) => {
  const now = Date.now();
  if (healthCache && now - healthCache.at < healthCache.ttl) {
    if (!force || now - healthCache.at < HEALTH_MIN_REFRESH_MS) return { ...healthCache.result, cached: true };
  }
  if (!healthInflight) {
    healthInflight = runHealthProbe()
      .then((result) => {
        const ttl = result.status === "available" ? HEALTH_TTL_OK_MS : HEALTH_TTL_FAILED_MS;
        healthCache = { result, at: Date.now(), ttl };
        return result;
      })
      .finally(() => {
        healthInflight = null;
      });
  }
  return { ...(await healthInflight), cached: false };
};

export const resetHealthCache = () => {
  healthCache = null;
  healthInflight = null;
};
