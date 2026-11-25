import jwt from "jsonwebtoken";
import { upsertStreamUser } from "../lib/stream.js";
import User from "../models/User.js";
import { resolveLanguage } from "../lib/supportedLanguages.js";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONBOARDING_FIELDS = ["fullName", "bio", "nativeLanguage", "learningLanguage", "location", "profilePic"];

// Single source of truth for the auth cookie so set and clear always match.
const cookieOptions = () => ({
  httpOnly: true, // not readable from JavaScript (XSS mitigation)
  sameSite: "strict", // CSRF mitigation
  secure: process.env.NODE_ENV === "production",
  path: "/",
});

const issueSession = (res, user) => {
  const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET_KEY, {
    expiresIn: "7d",
  });
  res.cookie("jwt", token, { ...cookieOptions(), maxAge: TOKEN_TTL_MS });
};

// Stores canonical language names; rejects anything unsupported. Returns an error string or null.
const canonicalizeLanguages = (updates) => {
  for (const field of ["nativeLanguage", "learningLanguage"]) {
    if (updates[field] === undefined) continue;
    const language = resolveLanguage(updates[field]);
    if (!language) return `${field} must be a supported language`;
    updates[field] = language.name;
  }
  return null;
};

const normalizeEmail = (email) => String(email).trim().toLowerCase();

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const syncStreamSafely = async (user, context) => {
  try {
    await upsertStreamUser({
      id: user._id.toString(),
      name: user.fullName,
      image: user.profilePic || "",
    });
  } catch (error) {
    console.warn(`Stream sync failed during ${context}:`, error.message);
  }
};

export async function signup(req, res) {
  try {
    const { email, password, fullName } = req.body ?? {};

    if (!isNonEmptyString(email) || !isNonEmptyString(password) || !isNonEmptyString(fullName)) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const normalizedEmail = normalizeEmail(email);

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    if (fullName.trim().length > 80) {
      return res.status(400).json({ message: "Full name must be 80 characters or fewer" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail }).select("_id");
    if (existingUser) {
      return res.status(409).json({ message: "Email already exists, please use a different one" });
    }

    const avatarSeed = encodeURIComponent(`${normalizedEmail}-${Date.now()}`);
    const randomAvatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=${avatarSeed}`;

    const newUser = await User.create({
      email: normalizedEmail,
      fullName: fullName.trim(),
      password,
      profilePic: randomAvatar,
    });

    await syncStreamSafely(newUser, "signup");
    issueSession(res, newUser);

    // toJSON strips the password hash
    return res.status(201).json({ success: true, user: newUser });
  } catch (error) {
    // Race between the existence check and insert: unique index wins.
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Email already exists, please use a different one" });
    }
    console.error("Error in signup controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body ?? {};

    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email: normalizeEmail(email) });
    // Same message for unknown email and wrong password (no account enumeration).
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const isPasswordCorrect = await user.matchPassword(password);
    if (!isPasswordCorrect) return res.status(401).json({ message: "Invalid email or password" });

    await syncStreamSafely(user, "login");
    issueSession(res, user);

    return res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Error in login controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export function logout(_req, res) {
  res.clearCookie("jwt", cookieOptions());
  return res.status(200).json({ success: true, message: "Logout successful" });
}

export async function onboard(req, res) {
  try {
    const body = req.body ?? {};
    const required = ["fullName", "bio", "nativeLanguage", "learningLanguage", "location"];
    const missingFields = required.filter((field) => !isNonEmptyString(body[field]));

    if (missingFields.length > 0) {
      return res.status(400).json({ message: "All fields are required", missingFields });
    }

    // Whitelist: never allow role, email, password, friends, etc. to be set here.
    const updates = {};
    for (const field of ONBOARDING_FIELDS) {
      if (typeof body[field] === "string") updates[field] = body[field].trim();
    }
    if (updates.fullName.length > 80) {
      return res.status(400).json({ message: "Full name must be 80 characters or fewer" });
    }
    if (updates.bio.length > 500) {
      return res.status(400).json({ message: "Bio must be 500 characters or fewer" });
    }
    const languageError = canonicalizeLanguages(updates);
    if (languageError) return res.status(400).json({ message: languageError });
    updates.isOnboarded = true;

    const updatedUser = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    await syncStreamSafely(updatedUser, "onboarding");
    return res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Onboarding error:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

// Authenticated profile update (non-privileged fields only).
export async function updateProfile(req, res) {
  try {
    const body = req.body ?? {};
    const updates = {};
    for (const field of ONBOARDING_FIELDS) {
      if (body[field] === undefined) continue;
      if (typeof body[field] !== "string") {
        return res.status(400).json({ message: `${field} must be a string` });
      }
      updates[field] = body[field].trim();
    }

    if (updates.fullName !== undefined && !updates.fullName) {
      return res.status(400).json({ message: "Full name cannot be empty" });
    }
    if (updates.fullName?.length > 80) {
      return res.status(400).json({ message: "Full name must be 80 characters or fewer" });
    }
    if (updates.bio?.length > 500) {
      return res.status(400).json({ message: "Bio must be 500 characters or fewer" });
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No updatable fields provided" });
    }
    const languageError = canonicalizeLanguages(updates);
    if (languageError) return res.status(400).json({ message: languageError });

    const updatedUser = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });
    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    await syncStreamSafely(updatedUser, "profile update");
    return res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Profile update error:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

// Viewer translation preferences. Only these keys are writable; language fields are untouched.
export async function updateTranslationPreferences(req, res) {
  try {
    const body = req.body ?? {};
    const set = {};

    if (body.targetChoice !== undefined) {
      if (!["native", "learning", "custom"].includes(body.targetChoice)) {
        return res.status(400).json({ message: "targetChoice must be native, learning, or custom" });
      }
      set["translationPreferences.targetChoice"] = body.targetChoice;
    }
    if (body.customTargetLanguage !== undefined) {
      const language = resolveLanguage(body.customTargetLanguage);
      if (!language) {
        return res.status(400).json({ message: "customTargetLanguage must be a supported language" });
      }
      set["translationPreferences.customTargetLanguage"] = language.name;
    }
    if (body.autoTranslate !== undefined) {
      if (typeof body.autoTranslate !== "boolean") {
        return res.status(400).json({ message: "autoTranslate must be true or false" });
      }
      set["translationPreferences.autoTranslate"] = body.autoTranslate;
    }
    if (body.displayMode !== undefined) {
      if (!["inline", "compact"].includes(body.displayMode)) {
        return res.status(400).json({ message: "displayMode must be inline or compact" });
      }
      set["translationPreferences.displayMode"] = body.displayMode;
    }

    if (Object.keys(set).length === 0) {
      return res.status(400).json({ message: "No translation preferences provided" });
    }

    const effectiveChoice = set["translationPreferences.targetChoice"] ?? req.user.translationPreferences?.targetChoice;
    const effectiveCustom = set["translationPreferences.customTargetLanguage"] ?? req.user.translationPreferences?.customTargetLanguage;
    if (effectiveChoice === "custom" && !effectiveCustom) {
      return res.status(400).json({ message: "Choose a custom translation language first" });
    }

    const updated = await User.findByIdAndUpdate(req.user._id, { $set: set }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ success: true, user: updated });
  } catch (error) {
    console.error("Translation preferences error:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

