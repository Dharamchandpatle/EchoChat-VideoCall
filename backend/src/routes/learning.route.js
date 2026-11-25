import express from "express";
import {
  completeLesson,
  getCategoriesByLevel,
  getLanguages,
  getLearningDashboard,
  getLessonDetails,
  getLevelAssessment,
  getPracticeQuiz,
  getAssessmentResult,
  getUserLanguageSelection,
  getUserLearningProfile,
  selectLanguagePair,
  submitLevelAssessment,
  submitPracticeQuiz,
} from "../controllers/learning.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createRevisionQuiz,
  createSavedWord,
  deleteSavedWord,
  getAnalytics,
  getIncorrectAnswers,
  getRevisionLessons,
  getTodayGoals,
  getWeakTopics,
  listSavedWords,
  reviewSavedWord,
  updateGoals,
  updateSavedWord,
} from "../controllers/learningPlus.controller.js";

const router = express.Router();

// Languages & User Selection
router.get("/languages", protectRoute, getLanguages);
router.get("/user-selection", protectRoute, getUserLanguageSelection);
router.post("/select-language", protectRoute, selectLanguagePair);

// Dashboard & Categories
router.get("/dashboard", protectRoute, getLearningDashboard);
router.get("/categories", protectRoute, getCategoriesByLevel);

// Lessons
router.get("/lessons/:categoryId", protectRoute, getLessonDetails);
router.post("/lessons/:lessonId/complete", protectRoute, completeLesson);

// Practice Quizzes
router.get("/quiz/:categoryId", protectRoute, getPracticeQuiz);
router.post("/quiz/submit", protectRoute, submitPracticeQuiz);

// Level Assessments
router.get("/assessment/:level", protectRoute, getLevelAssessment);
router.post("/assessment/submit", protectRoute, submitLevelAssessment);
router.get("/assessment-result/:attemptId", protectRoute, getAssessmentResult);

// User Profile & Achievements
router.get("/progress", protectRoute, getUserLearningProfile);

// Vocabulary book
router.get("/vocabulary", protectRoute, listSavedWords);
router.post("/vocabulary", protectRoute, createSavedWord);
router.patch("/vocabulary/:id", protectRoute, updateSavedWord);
router.delete("/vocabulary/:id", protectRoute, deleteSavedWord);
router.post("/vocabulary/:id/review", protectRoute, reviewSavedWord);

// Daily goals, analytics, revision
router.get("/goals/today", protectRoute, getTodayGoals);
router.patch("/goals", protectRoute, updateGoals);
router.get("/analytics", protectRoute, getAnalytics);
router.get("/revision/lessons", protectRoute, getRevisionLessons);
router.get("/revision/weak-topics", protectRoute, getWeakTopics);
router.get("/revision/incorrect", protectRoute, getIncorrectAnswers);
router.post("/revision/quiz", protectRoute, createRevisionQuiz);

export default router;
