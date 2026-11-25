import mongoose from "mongoose";

const lessonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningCategory",
      required: true,
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
    order: {
      type: Number,
      default: 1,
    },
    grammarNotes: {
      type: String,
      default: "",
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

lessonSchema.index({ sourceLanguage: 1, targetLanguage: 1, category: 1, level: 1 });

const Lesson = mongoose.model("Lesson", lessonSchema);
export default Lesson;
