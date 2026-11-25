import express from "express";
import { getAdminStats, makeMeAdmin, saveCategory, triggerSeed } from "../controllers/adminLearning.controller.js";
import {
  checkLanguagePair,
  createLesson,
  createQuestion,
  listContent,
  saveLanguage,
  setQuestionActive,
  updateLesson,
  updateQuestion,
} from "../controllers/adminContent.controller.js";
import {
  listUsers,
  listReports,
  platformAnalytics,
  reviewReport,
  setUserStatus,
  userActivity,
} from "../controllers/adminManagement.controller.js";
import { adminOnly, protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Self-promotion is a development-only convenience. It is disabled in production and off unless
// ALLOW_SELF_ADMIN_CLAIM=true. Real admins are provisioned with `npm run admin:grant -- <email>`.
// It is registered before the admin guard so it is only reachable when explicitly enabled.
const selfClaimAllowed = process.env.NODE_ENV !== "production" && process.env.ALLOW_SELF_ADMIN_CLAIM === "true";
router.post(
  "/claim-admin",
  (req, res, next) => (selfClaimAllowed ? next() : res.status(404).json({ message: "Not found" })),
  protectRoute,
  makeMeAdmin
);

// Every route below requires an authenticated administrator.
router.use(protectRoute, adminOnly);

// Dashboard and analytics
router.get("/stats", getAdminStats);
router.get("/analytics", platformAnalytics);

// User management and moderation
router.get("/users", listUsers);
router.get("/users/:id/activity", userActivity);
router.patch("/users/:id/status", setUserStatus);
router.get("/reports", listReports);
router.patch("/reports/:id", reviewReport);

// Learning content: read
router.get("/content/languages", listContent("languages"));
router.get("/content/categories", listContent("categories"));
router.get("/content/lessons", listContent("lessons"));
router.get("/content/questions", listContent("questions"));

// Learning content: write (validated; duplicates rejected; content deactivated rather than deleted)
router.post("/languages", saveLanguage);
router.post("/categories", saveCategory);
router.post("/lessons", createLesson);
router.put("/lessons/:id", updateLesson);
router.post("/questions", createQuestion);
router.put("/questions/:id", updateQuestion);
router.patch("/questions/:id/active", setQuestionActive);
router.post("/language-pair/check", checkLanguagePair);
router.post("/seed", triggerSeed);

export default router;
