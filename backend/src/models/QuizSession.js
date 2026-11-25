import mongoose from "mongoose";

// A server-issued quiz or assessment instance. Grading only considers the questionIds stored here,
// and each session can be submitted exactly once. This blocks client-chosen question sets,
// arbitrary answer-key probing, and duplicate submissions.
const quizSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["practice", "assessment"], required: true },
    level: { type: String, enum: ["easy", "medium", "hard"], required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "LearningCategory", default: null },
    sourceLanguage: { type: String, required: true },
    targetLanguage: { type: String, required: true },
    questionIds: {
      type: [mongoose.Schema.Types.ObjectId],
      validate: [(v) => v.length > 0, "A session needs at least one question"],
    },
    status: { type: String, enum: ["open", "submitted"], default: "open" },
    expiresAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

quizSessionSchema.index({ user: 1, status: 1, expiresAt: 1 });

const QuizSession = mongoose.model("QuizSession", quizSessionSchema);
export default QuizSession;
