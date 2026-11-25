import mongoose from "mongoose";

const quizQuestionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "mcq",
        "match",
        "translate",
        "fill_blank",
        "correct_sentence",
        "listen_identify",
        "arrange_words",
      ],
      required: true,
      default: "mcq",
    },
    sourceLanguage: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    targetLanguage: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    level: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
      default: "easy",
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningCategory",
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lesson",
    },
    isAssessment: {
      type: Boolean,
      default: false,
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    prompt: {
      type: String,
      default: "",
    },
    audioText: {
      type: String,
      default: "",
    },
    options: [
      {
        type: String,
      },
    ],
    // Correct answer stored securely on server only
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // For "match" type: pairs of words [{ left: "नमस्ते", right: "नमस्कार" }]
    pairs: [
      {
        left: String,
        right: String,
      },
    ],
    // For "arrange_words" type: list of jumbled words to order
    wordsToArrange: [
      {
        type: String,
      },
    ],
    // Correct order of words: e.g. ["माझे", "नाव", "धर्मचंद", "आहे"]
    correctOrder: [
      {
        type: String,
      },
    ],
    explanation: {
      type: String,
      default: "",
    },
    points: {
      type: Number,
      default: 1,
    },
    order: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

quizQuestionSchema.index({ sourceLanguage: 1, targetLanguage: 1, level: 1, isAssessment: 1 });
quizQuestionSchema.index({ category: 1, isAssessment: 1 });

const QuizQuestion = mongoose.model("QuizQuestion", quizQuestionSchema);
export default QuizQuestion;
