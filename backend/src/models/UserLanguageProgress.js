import mongoose from "mongoose";

const userLanguageProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    nativeLanguage: {
      type: String,
      required: true,
      lowercase: true,
    },
    targetLanguage: {
      type: String,
      required: true,
      lowercase: true,
    },
    currentLevel: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy",
    },
    unlockedLevels: {
      type: [String],
      enum: ["easy", "medium", "hard"],
      default: ["easy"],
    },
    totalStars: {
      type: Number,
      default: 0,
      min: 0,
    },
    levelStars: {
      easy: { type: Number, default: 0, min: 0, max: 5 },
      medium: { type: Number, default: 0, min: 0, max: 5 },
      hard: { type: Number, default: 0, min: 0, max: 5 },
    },
    levelBestScores: {
      easy: { type: Number, default: 0, min: 0, max: 100 },
      medium: { type: Number, default: 0, min: 0, max: 100 },
      hard: { type: Number, default: 0, min: 0, max: 100 },
    },
    streak: {
      current: { type: Number, default: 0 },
      longest: { type: Number, default: 0 },
      lastActiveDate: { type: Date },
    },
    lastLearnedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

userLanguageProgressSchema.index({ user: 1, nativeLanguage: 1, targetLanguage: 1 }, { unique: true });

const UserLanguageProgress = mongoose.model("UserLanguageProgress", userLanguageProgressSchema);
export default UserLanguageProgress;
