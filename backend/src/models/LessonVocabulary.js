import mongoose from "mongoose";

const lessonVocabularySchema = new mongoose.Schema(
  {
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
    sourceText: {
      type: String,
      required: true,
      trim: true,
    },
    targetText: {
      type: String,
      required: true,
      trim: true,
    },
    romanized: {
      type: String,
      required: true,
      trim: true,
    },
    partOfSpeech: {
      type: String,
      default: "phrase",
    },
    exampleSource: {
      type: String,
      default: "",
    },
    exampleTarget: {
      type: String,
      default: "",
    },
    exampleRomanized: {
      type: String,
      default: "",
    },
    audioUrl: {
      type: String,
      default: "",
    },
    order: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

lessonVocabularySchema.index({ lesson: 1, order: 1 });

const LessonVocabulary = mongoose.model("LessonVocabulary", lessonVocabularySchema);
export default LessonVocabulary;
