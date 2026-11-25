// Pure translation logic: no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";

const { resolveLanguage, SUPPORTED_LANGUAGES } = await import("../lib/supportedLanguages.js");
const { parseGeminiJson, cacheKey, translateText, TranslationError } = await import("../services/translation.service.js");

test("language resolution accepts names, codes and aliases case-insensitively", () => {
  assert.equal(resolveLanguage("Marathi").code, "mr");
  assert.equal(resolveLanguage("  hindi ").code, "hi");
  assert.equal(resolveLanguage("mr").name, "Marathi");
  assert.equal(resolveLanguage("Chinese").code, "zh");
  assert.equal(resolveLanguage("Oriya").code, "or");
});

test("unsupported or malformed language values resolve to null", () => {
  assert.equal(resolveLanguage("Klingon"), null);
  assert.equal(resolveLanguage(""), null);
  assert.equal(resolveLanguage("<script>alert(1)</script>"), null);
  assert.equal(resolveLanguage(undefined), null);
  assert.equal(resolveLanguage(["Hindi"]), null);
});

test("the supported list has unique names and codes covering all Indian languages", () => {
  const names = SUPPORTED_LANGUAGES.map((l) => l.name);
  const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(codes).size, codes.length);
  for (const required of ["Hindi", "Marathi", "Tamil", "Bodo", "Santali", "English"]) {
    assert.ok(names.includes(required), `${required} must be supported`);
  }
});

test("Gemini JSON reply is parsed into translation and detected language", () => {
  const out = parseGeminiJson('{"detected_language_code":"hi","translation":"तू कसा आहेस?"}');
  assert.equal(out.translation, "तू कसा आहेस?");
  assert.equal(out.detectedCode, "hi");
});

test("Gemini replies wrapped in code fences are accepted", () => {
  const out = parseGeminiJson('```json\n{"detected_language_code":"en","translation":"नमस्ते"}\n```');
  assert.equal(out.translation, "नमस्ते");
  assert.equal(out.detectedCode, "en");
});

test("an unknown detected language is reported as null, not trusted", () => {
  const out = parseGeminiJson('{"detected_language_code":"xx-fake","translation":"hello"}');
  assert.equal(out.detectedCode, null);
});

test("plain-text Gemini replies are used as the translation when JSON is absent", () => {
  const out = parseGeminiJson("Namaste, aap kaise hain?");
  assert.equal(out.translation, "Namaste, aap kaise hain?");
  assert.equal(out.detectedCode, null);
});

test("empty Gemini replies are treated as failures", () => {
  assert.throws(() => parseGeminiJson("   "), TranslationError);
  assert.throws(() => parseGeminiJson('{"translation":""}'), TranslationError);
});

test("cache keys differ by text, source, and target but not by call order", () => {
  const a = cacheKey("hello", "en", "hi");
  assert.equal(a, cacheKey("hello", "en", "hi"));
  assert.notEqual(a, cacheKey("hello", "en", "mr"));
  assert.notEqual(a, cacheKey("hello", null, "hi"));
  assert.notEqual(a, cacheKey("Hello", "en", "hi"));
});

test("empty and whitespace-only messages are rejected before any provider call", async () => {
  await assert.rejects(translateText({ text: "   ", targetCode: "hi" }), (e) => e instanceof TranslationError && e.status === 400 && e.code === "EMPTY_TEXT");
  await assert.rejects(translateText({ text: "", targetCode: "hi" }), (e) => e.code === "EMPTY_TEXT");
});

test("messages over the length limit are rejected", async () => {
  await assert.rejects(
    translateText({ text: "a".repeat(2001), targetCode: "hi" }),
    (e) => e.status === 400 && e.code === "TEXT_TOO_LONG"
  );
});

test("unsupported target language is rejected", async () => {
  await assert.rejects(translateText({ text: "hello", targetCode: "xx" }), (e) => e.code === "UNSUPPORTED_TARGET");
});

test("same source and target returns the original text without any provider call", async () => {
  const out = await translateText({ text: "  Namaste  ", sourceCode: "hi", targetCode: "hi" });
  assert.equal(out.translatedText, "Namaste");
  assert.equal(out.provider, "none");
  assert.equal(out.cached, false);
});
