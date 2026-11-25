import express from "express";
import { aiHealth, chatWithAI, detectLanguage, translateText } from "../controllers/ai.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { conversationPractice, grammarCheck, smartReplies, wordExplanation } from "../controllers/aiTutor.controller.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

// Limits are per authenticated user (protectRoute runs first). Chat is the expensive path;
// translation is higher volume because auto-translate can fire for every incoming message.
const byUser = (req) => String(req.user?._id ?? req.ip);
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  name: "ai-chat",
  keyBy: byUser,
  message: "Too many AI requests. Please wait a minute and try again.",
});
const translateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  name: "ai-translate",
  keyBy: byUser,
  message: "Too many translation requests. Please wait a moment.",
});

// Real provider check (cached server-side). Authenticated so anonymous callers cannot trigger probes.
router.get("/health", protectRoute, aiHealth);

router.post("/chat", protectRoute, chatLimiter, chatWithAI);
router.post("/translate", protectRoute, translateLimiter, translateText);
router.post("/detect-language", protectRoute, chatLimiter, detectLanguage);

// Language-learning assistant (Gemini). Each call is one model request, so it shares the chat limit.
router.post("/grammar", protectRoute, chatLimiter, grammarCheck);
router.post("/explain-word", protectRoute, chatLimiter, wordExplanation);
router.post("/practice", protectRoute, chatLimiter, conversationPractice);
router.post("/suggest-replies", protectRoute, chatLimiter, smartReplies);

export default router;
