import mongoose from "mongoose";

// A word a user chose to keep in their personal vocabulary book.
const savedWordSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    word: { type: String, required: true, trim: true, maxlength: 120 },
    meaning: { type: String, default: "", maxlength: 500 },
    partOfSpeech: { type: String, default: "", maxlength: 40 },
    example: { type: String, default: "", maxlength: 500 },
    exampleTranslation: { type: String, default: "", maxlength: 500 },
    sourceLanguage: { type: String, required: true }, // language the user reads (native)
    targetLanguage: { type: String, required: true }, // language the word is in (learning)
    learned: { type: Boolean, default: false },
    reviewCount: { type: Number, default: 0 },
    lastReviewedAt: { type: Date, default: null },
    origin: { type: String, enum: ["lesson", "ai", "manual"], default: "manual" },
  },
  { timestamps: true }
);

// One entry per user, word, and pair: prevents duplicate saves.
savedWordSchema.index({ user: 1, targetLanguage: 1, word: 1 }, { unique: true });
savedWordSchema.index({ user: 1, learned: 1, lastReviewedAt: 1 });

export default mongoose.model("SavedWord", savedWordSchema);
