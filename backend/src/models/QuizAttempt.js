import mongoose from "mongoose";

const answerRecordSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuizQuestion",
      required: true,
    },
    questionText: String,
    type: String,
    userAnswer: mongoose.Schema.Types.Mixed,
    isCorrect: Boolean,
    correctAnswer: mongoose.Schema.Types.Mixed,
    explanation: String,
  },
  { _id: false }
);

const quizAttemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
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
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningCategory",
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lesson",
    },
    type: {
      type: String,
      enum: ["practice", "assessment"],
      required: true,
      default: "practice",
    },
    totalQuestions: {
      type: Number,
      required: true,
    },
    correctAnswers: {
      type: Number,
      required: true,
    },
    incorrectAnswers: {
      type: Number,
      required: true,
    },
    scorePercentage: {
      type: Number,
      required: true,
    },
    timeTakenSeconds: {
      type: Number,
      default: 0,
    },
    starsEarned: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    isPassed: {
      type: Boolean,
      default: false,
    },
    answers: [answerRecordSchema],
  },
  { timestamps: true }
);

quizAttemptSchema.index({ user: 1, type: 1, level: 1, createdAt: -1 });

const QuizAttempt = mongoose.model("QuizAttempt", quizAttemptSchema);
export default QuizAttempt;
