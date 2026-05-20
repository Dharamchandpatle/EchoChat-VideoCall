import express from "express";
import {
    chatWithAI,
    detectLanguage,
    translateText,
} from "../controllers/ai.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// AI chat endpoint - for handling queries with language understanding
router.post("/chat", protectRoute, chatWithAI);

// Translate text endpoint
router.post("/translate", protectRoute, translateText);

// Detect language endpoint
router.post("/detect-language", protectRoute, detectLanguage);

export default router;
