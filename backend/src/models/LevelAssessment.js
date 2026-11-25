import mongoose from "mongoose";

const levelAssessmentSchema = new mongoose.Schema(
  {
    sourceLanguage: {
      type: String,
      required: true,
      lowercase: true,
    },
    targetLanguage: {
      type: String,
      required: true,
      lowercase: true,
    },
    level: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    passingPercentage: {
      type: Number,
      default: 60,
    },
    questionCount: {
      type: Number,
      required: true,
    },
    timeLimitMinutes: {
      type: Number,
      default: 20,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

levelAssessmentSchema.index({ sourceLanguage: 1, targetLanguage: 1, level: 1 }, { unique: true });

const LevelAssessment = mongoose.model("LevelAssessment", levelAssessmentSchema);
export default LevelAssessment;
