import mongoose from "mongoose";

const userRewardSchema = new mongoose.Schema(
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
    assessmentAttempt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuizAttempt",
      required: true,
    },
    starsAwarded: {
      type: Number,
      required: true,
      min: 0,
      max: 5,
    },
    scorePercentage: {
      type: Number,
      required: true,
    },
    transactionType: {
      type: String,
      enum: ["level_test_star_reward"],
      default: "level_test_star_reward",
    },
    awardedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

userRewardSchema.index({ user: 1, assessmentAttempt: 1 }, { unique: true });
userRewardSchema.index({ user: 1, level: 1, transactionType: 1 });

const UserReward = mongoose.model("UserReward", userRewardSchema);
export default UserReward;
