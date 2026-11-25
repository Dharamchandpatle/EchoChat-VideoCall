import mongoose from "mongoose";

// Content-addressed translation cache. A translation depends only on the text and the
// languages, never on the requesting user, so one entry serves both chat participants.
// Entries expire automatically (TTL index) after 30 days.
const translationCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // sha256(source|target|text)
    sourceLanguage: { type: String, required: true }, // ISO code or "auto"
    targetLanguage: { type: String, required: true },
    detectedLanguage: { type: String, default: null },
    originalText: { type: String, required: true },
    translatedText: { type: String, required: true },
    provider: { type: String, enum: ["gemini", "mymemory"], required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

translationCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TranslationCache = mongoose.model("TranslationCache", translationCacheSchema);
export default TranslationCache;
