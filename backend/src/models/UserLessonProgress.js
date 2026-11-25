import mongoose from "mongoose";

const userLessonProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningCategory",
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
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
    quizCompleted: {
      type: Boolean,
      default: false,
    },
    quizBestScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  { timestamps: true }
);

userLessonProgressSchema.index({ user: 1, lesson: 1 }, { unique: true });
userLessonProgressSchema.index({ user: 1, category: 1 });

const UserLessonProgress = mongoose.model("UserLessonProgress", userLessonProgressSchema);
export default UserLessonProgress;
