import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
    },
    bio: {
      type: String,
      default: "",
    },
    profilePic: {
      type: String,
      default: "",
    },
    nativeLanguage: {
      type: String,
      default: "",
    },
    learningLanguage: {
      type: String,
      default: "",
    },
    location: {
      type: String,
      default: "",
    },
    isOnboarded: {
      type: Boolean,
      default: false,
    },
    friends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    // Moderation: suspended accounts cannot use the API (see protectRoute).
    accountStatus: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    // Users this account has blocked. Blocks are symmetric in effect: neither side can see or contact the other.
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Daily learning targets (per user, across language pairs).
    learningGoals: {
      dailyLessons: { type: Number, default: 1, min: 0, max: 10 },
      dailyQuizzes: { type: Number, default: 1, min: 0, max: 10 },
    },
    // Updated (throttled) on authenticated requests; used for activity and "active users".
    lastSeenAt: { type: Date, default: null },
    // Per-user translation viewing preferences (independent of learning course settings).
    // targetChoice picks which language the viewer translates into; it follows the native or
    // learning language live, so changing one language never overwrites the other.
    translationPreferences: {
      targetChoice: { type: String, enum: ["native", "learning", "custom"], default: "native" },
      customTargetLanguage: { type: String, default: "" },
      autoTranslate: { type: Boolean, default: false },
      displayMode: { type: String, enum: ["inline", "compact"], default: "inline" },
    },
    activeLanguagePair: {
      nativeLanguage: {
        type: String,
        default: "hi",
      },
      targetLanguage: {
        type: String,
        default: "mr",
      },
    },
  },
  { timestamps: true }
);

// Never serialize the password hash (or internal version key) to API responses.
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  const isPasswordCorrect = await bcrypt.compare(enteredPassword, this.password);
  return isPasswordCorrect;
};

userSchema.index({ lastSeenAt: -1 });
userSchema.index({ accountStatus: 1 });

const User = mongoose.model("User", userSchema);

export default User;