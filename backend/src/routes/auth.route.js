import express from "express";
import {
  login,
  logout,
  onboard,
  signup,
  updateProfile,
  updateTranslationPreferences,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

// Brute-force protection on credential endpoints (per IP).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  name: "auth",
});

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/logout", logout);

router.post("/onboarding", protectRoute, onboard);
router.patch("/profile", protectRoute, updateProfile);
router.patch("/translation-preferences", protectRoute, updateTranslationPreferences);

// check if user is logged in
router.get("/me", protectRoute, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export default router;
