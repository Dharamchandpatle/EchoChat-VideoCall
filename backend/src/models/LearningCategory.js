import mongoose from "mongoose";

const learningCategorySchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    icon: {
      type: String,
      default: "BookOpen",
    },
    level: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy",
    },
    order: {
      type: Number,
      required: true,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const LearningCategory = mongoose.model("LearningCategory", learningCategorySchema);
export default LearningCategory;
