// Personalized learning: vocabulary book, daily goals, analytics, and revision.
// All data is scoped to the caller's active language pair and to the caller's own user id.
import mongoose from "mongoose";
import User from "../models/User.js";
import SavedWord from "../models/SavedWord.js";
import Lesson from "../models/Lesson.js";
import LessonVocabulary from "../models/LessonVocabulary.js";
import LearningCategory from "../models/LearningCategory.js";
import QuizAttempt from "../models/QuizAttempt.js";
import QuizQuestion from "../models/QuizQuestion.js";
import UserLanguageProgress from "../models/UserLanguageProgress.js";
import UserLessonProgress from "../models/UserLessonProgress.js";
import { createSession, sanitizeQuestion } from "./learning.controller.js";
import { shuffleItems } from "../lib/shuffle.js";
import {
  goalProgress,
  isValidWordInput,
  startOfUtcDay,
  streakAtRisk,
  summarizeAttempts,
  collectIncorrect,
  weakestCategories,
  percent,
} from "../lib/learningInsights.js";

const pairOf = async (userId) => {
  const user = await User.findById(userId).select("activeLanguagePair learningGoals").lean();
  return {
    sourceLanguage: user?.activeLanguagePair?.nativeLanguage || "hi",
    targetLanguage: user?.activeLanguagePair?.targetLanguage || "mr",
    goals: {
      dailyLessons: user?.learningGoals?.dailyLessons ?? 1,
      dailyQuizzes: user?.learningGoals?.dailyQuizzes ?? 1,
    },
  };
};

const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const handleError = (res, label, error) => {
  console.error(`${label} error:`, error.message);
  return res.status(500).json({ message: "Internal server error" });
};

// ---------------------------------------------------------------------------
// Vocabulary book
// ---------------------------------------------------------------------------

const sanitizeWordFields = (body = {}) => {
  const trimmed = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    word: trimmed(body.word, 120),
    meaning: trimmed(body.meaning, 500),
    partOfSpeech: trimmed(body.partOfSpeech, 40),
    example: trimmed(body.example, 500),
    exampleTranslation: trimmed(body.exampleTranslation, 500),
  };
};

export const listSavedWords = async (req, res) => {
  try {
    const pair = await pairOf(req.user._id);
    const page = clampInt(req.query.page, 1, 10000, 1);
    const limit = clampInt(req.query.limit, 1, 100, 20);
    const filter = { user: req.user._id, targetLanguage: pair.targetLanguage };

    if (req.query.learned === "true") filter.learned = true;
    else if (req.query.learned === "false") filter.learned = false;

    // Review mode: learned words, least recently reviewed first.
    const review = req.query.mode === "review";
    if (review) filter.learned = true;

    const [items, total] = await Promise.all([
      SavedWord.find(filter)
        .sort(review ? { lastReviewedAt: 1, createdAt: 1 } : { createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SavedWord.countDocuments(filter),
    ]);

    return res.status(200).json({ items, page, limit, total, hasMore: page * limit < total });
  } catch (error) {
    return handleError(res, "listSavedWords", error);
  }
};

export const createSavedWord = async (req, res) => {
  try {
    const pair = await pairOf(req.user._id);
    const body = req.body ?? {};
    let fields;

    if (body.lessonVocabularyId !== undefined) {
      // Copy a word from a lesson, so the user does not retype it.
      if (!mongoose.isValidObjectId(body.lessonVocabularyId)) {
        return res.status(400).json({ message: "Invalid lesson vocabulary id" });
      }
      const source = await LessonVocabulary.findById(body.lessonVocabularyId).lean();
      if (!source) return res.status(404).json({ message: "Lesson word not found" });
      fields = {
        word: source.targetText,
        meaning: source.sourceText,
        partOfSpeech: source.partOfSpeech || "",
        example: source.exampleTarget || "",
        exampleTranslation: source.exampleSource || "",
        origin: "lesson",
      };
    } else {
      fields = { ...sanitizeWordFields(body), origin: ["ai", "manual"].includes(body.origin) ? body.origin : "manual" };
    }

    if (!isValidWordInput(fields.word)) return res.status(400).json({ message: "word is required (120 characters or fewer)" });

    try {
      const created = await SavedWord.create({
        ...fields,
        user: req.user._id,
        sourceLanguage: pair.sourceLanguage,
        targetLanguage: pair.targetLanguage,
      });
      return res.status(201).json({ success: true, word: created });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ message: "This word is already in your vocabulary book" });
      throw error;
    }
  } catch (error) {
    return handleError(res, "createSavedWord", error);
  }
};

export const updateSavedWord = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid word id" });
    const body = req.body ?? {};
    const set = {};
    if (body.learned !== undefined) {
      if (typeof body.learned !== "boolean") return res.status(400).json({ message: "learned must be true or false" });
      set.learned = body.learned;
    }
    for (const field of ["meaning", "partOfSpeech", "example", "exampleTranslation"]) {
      if (body[field] !== undefined) {
        if (typeof body[field] !== "string") return res.status(400).json({ message: `${field} must be text` });
        set[field] = body[field].trim().slice(0, field === "partOfSpeech" ? 40 : 500);
      }
    }
    if (Object.keys(set).length === 0) return res.status(400).json({ message: "No updatable fields provided" });

    // Scoped to the owner: another user's id returns 404, not 403.
    const updated = await SavedWord.findOneAndUpdate({ _id: id, user: req.user._id }, { $set: set }, { new: true });
    if (!updated) return res.status(404).json({ message: "Word not found" });
    return res.status(200).json({ success: true, word: updated });
  } catch (error) {
    return handleError(res, "updateSavedWord", error);
  }
};

export const deleteSavedWord = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid word id" });
    const removed = await SavedWord.deleteOne({ _id: id, user: req.user._id });
    if (removed.deletedCount === 0) return res.status(404).json({ message: "Word not found" });
    return res.status(200).json({ success: true });
  } catch (error) {
    return handleError(res, "deleteSavedWord", error);
  }
};

export const reviewSavedWord = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid word id" });
    const updated = await SavedWord.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { $inc: { reviewCount: 1 }, $set: { lastReviewedAt: new Date() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Word not found" });
    return res.status(200).json({ success: true, word: updated });
  } catch (error) {
    return handleError(res, "reviewSavedWord", error);
  }
};

// ---------------------------------------------------------------------------
// Daily goals
// ---------------------------------------------------------------------------

const todayStatus = async (userId, pair) => {
  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const [lessonsToday, quizzesToday, progress] = await Promise.all([
    UserLessonProgress.countDocuments({
      user: userId,
      isCompleted: true,
      completedAt: { $gte: dayStart },
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
    }),
    QuizAttempt.countDocuments({
      user: userId,
      createdAt: { $gte: dayStart },
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
    }),
    UserLanguageProgress.findOne({
      user: userId,
      nativeLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
    }).lean(),
  ]);

  const streak = progress?.streak ?? { current: 0, longest: 0, lastActiveDate: null };
  const goals = goalProgress({ lessonsToday, quizzesToday, dailyLessons: pair.goals.dailyLessons, dailyQuizzes: pair.goals.dailyQuizzes });
  const atRisk = streakAtRisk({ currentStreak: streak.current, lastActiveDate: streak.lastActiveDate, now });

  let reminder = null;
  if (atRisk) reminder = `Keep your ${streak.current}-day streak alive: complete one activity today.`;
  else if (!goals.allMet) reminder = "Today's learning goal is not finished yet.";

  return {
    date: dayStart.toISOString().slice(0, 10),
    timezone: "UTC",
    goals,
    streak: { current: streak.current ?? 0, longest: streak.longest ?? 0, atRisk },
    reminder,
  };
};

export const getTodayGoals = async (req, res) => {
  try {
    const pair = await pairOf(req.user._id);
    return res.status(200).json(await todayStatus(req.user._id, pair));
  } catch (error) {
    return handleError(res, "getTodayGoals", error);
  }
};

export const updateGoals = async (req, res) => {
  try {
    const body = req.body ?? {};
    const set = {};
    for (const [field, max] of [["dailyLessons", 10], ["dailyQuizzes", 10]]) {
      if (body[field] === undefined) continue;
      if (!Number.isInteger(body[field]) || body[field] < 0 || body[field] > max) {
        return res.status(400).json({ message: `${field} must be a whole number from 0 to ${max}` });
      }
      set[`learningGoals.${field}`] = body[field];
    }
    if (Object.keys(set).length === 0) return res.status(400).json({ message: "No goals provided" });

    await User.updateOne({ _id: req.user._id }, { $set: set });
    const pair = await pairOf(req.user._id);
    return res.status(200).json({ success: true, goals: pair.goals });
  } catch (error) {
    return handleError(res, "updateGoals", error);
  }
};

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const getAnalytics = async (req, res) => {
  try {
    const pair = await pairOf(req.user._id);
    const pairFilter = { user: req.user._id, sourceLanguage: pair.sourceLanguage, targetLanguage: pair.targetLanguage };

    const [attempts, lessonsCompleted, totalLessons, categories, progress, lessonProgress] = await Promise.all([
      QuizAttempt.find(pairFilter).select("type totalQuestions correctAnswers timeTakenSeconds category createdAt").lean(),
      UserLessonProgress.countDocuments({ ...pairFilter, isCompleted: true }),
      Lesson.countDocuments({ sourceLanguage: pair.sourceLanguage, targetLanguage: pair.targetLanguage, isPublished: true }),
      LearningCategory.find({ isActive: true }).select("name").lean(),
      UserLanguageProgress.findOne({ user: req.user._id, nativeLanguage: pair.sourceLanguage, targetLanguage: pair.targetLanguage }).lean(),
      UserLessonProgress.find({ ...pairFilter, isCompleted: true }).select("category").lean(),
    ]);

    const summary = summarizeAttempts(attempts);
    const completedByCategory = new Map();
    for (const lp of lessonProgress) {
      const key = String(lp.category);
      completedByCategory.set(key, (completedByCategory.get(key) || 0) + 1);
    }

    const lessonsPerCategory = await Lesson.aggregate([
      { $match: { sourceLanguage: pair.sourceLanguage, targetLanguage: pair.targetLanguage, isPublished: true } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    const totalByCategory = new Map(lessonsPerCategory.map((g) => [String(g._id), g.count]));

    const progressByCategory = categories
      .filter((c) => totalByCategory.has(String(c._id)) || summary.byCategory.has(String(c._id)))
      .map((c) => {
        const id = String(c._id);
        const quiz = summary.byCategory.get(id);
        return {
          categoryId: id,
          name: c.name,
          lessonsCompleted: completedByCategory.get(id) || 0,
          lessonsTotal: totalByCategory.get(id) || 0,
          lessonCompletionPercent: percent(completedByCategory.get(id) || 0, totalByCategory.get(id) || 0),
          quizAccuracyPercent: quiz ? percent(quiz.correct, quiz.total) : null,
        };
      });

    return res.status(200).json({
      languagePair: { native: pair.sourceLanguage, learning: pair.targetLanguage },
      lessons: { completed: lessonsCompleted, available: totalLessons },
      quizzes: {
        attempts: summary.attempts,
        questionsAnswered: summary.totalQuestions,
        correct: summary.correctAnswers,
        incorrect: summary.incorrectAnswers,
        accuracyPercent: summary.accuracy,
      },
      streak: { current: progress?.streak?.current ?? 0, longest: progress?.streak?.longest ?? 0 },
      timeSpent: {
        quizSeconds: summary.quizTimeSeconds,
        note: "Only quiz time is measured. Lesson reading time is not tracked.",
      },
      // Facts only. No proficiency score is computed because no scoring methodology is defined.
      levelProgress: {
        unlockedLevels: progress?.unlockedLevels ?? ["easy"],
        totalStars: progress?.totalStars ?? 0,
        bestScoreByLevel: progress?.levelBestScores ?? { easy: 0, medium: 0, hard: 0 },
      },
      progressByCategory,
    });
  } catch (error) {
    return handleError(res, "getAnalytics", error);
  }
};

// ---------------------------------------------------------------------------
// Revision
// ---------------------------------------------------------------------------

export const getRevisionLessons = async (req, res) => {
  try {
    const pair = await pairOf(req.user._id);
    const completed = await UserLessonProgress.find({
      user: req.user._id,
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
      isCompleted: true,
    })
      .populate("lesson", "title level order")
      .populate("category", "name")
      .sort({ completedAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      items: completed
        .filter((c) => c.lesson)
        .map((c) => ({
          lessonId: c.lesson._id,
          title: c.lesson.title,
          level: c.lesson.level,
          category: c.category?.name || "",
          completedAt: c.completedAt,
        })),
    });
  } catch (error) {
    return handleError(res, "getRevisionLessons", error);
  }
};

export const getWeakTopics = async (req, res) => {
  try {
    const pair = await pairOf(req.user._id);
    const attempts = await QuizAttempt.find({
      user: req.user._id,
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
    })
      .select("totalQuestions correctAnswers timeTakenSeconds category")
      .lean();

    const weak = weakestCategories(summarizeAttempts(attempts).byCategory);
    const categories = await LearningCategory.find({ _id: { $in: weak.map((w) => w.categoryId) } }).select("name").lean();
    const names = new Map(categories.map((c) => [String(c._id), c.name]));
    return res.status(200).json({ items: weak.map((w) => ({ ...w, name: names.get(w.categoryId) || "" })) });
  } catch (error) {
    return handleError(res, "getWeakTopics", error);
  }
};

export const getIncorrectAnswers = async (req, res) => {
  try {
    const pair = await pairOf(req.user._id);
    const attempts = await QuizAttempt.find({
      user: req.user._id,
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
      "answers.isCorrect": false,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("answers createdAt")
      .lean();

    const incorrect = collectIncorrect(attempts, 50);
    // Only questions that still exist and are active can be practised again.
    const active = await QuizQuestion.find({ _id: { $in: incorrect.map((i) => i.questionId) }, isActive: true }).select("_id").lean();
    const activeIds = new Set(active.map((a) => String(a._id)));
    return res.status(200).json({ items: incorrect.filter((i) => activeIds.has(i.questionId)) });
  } catch (error) {
    return handleError(res, "getIncorrectAnswers", error);
  }
};

// Revision quiz from questions the user got wrong. Graded by the same session flow as normal quizzes.
export const createRevisionQuiz = async (req, res) => {
  try {
    const pair = await pairOf(req.user._id);
    const attempts = await QuizAttempt.find({
      user: req.user._id,
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
      "answers.isCorrect": false,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("answers createdAt")
      .lean();

    const candidateIds = collectIncorrect(attempts, 50).map((i) => i.questionId);
    const questions = await QuizQuestion.find({ _id: { $in: candidateIds }, isActive: true }).lean();
    if (questions.length < 3) {
      return res.status(409).json({ message: "Answer a few more quiz questions first. Revision quizzes need at least 3 questions you got wrong." });
    }

    const selected = shuffleItems(questions).slice(0, 10);
    const session = await createSession({
      userId: req.user._id,
      kind: "practice",
      level: selected[0].level || "easy",
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
      questions: selected,
    });

    return res.status(200).json({
      sessionId: session._id,
      expiresAt: session.expiresAt,
      totalQuestions: selected.length,
      questions: selected.map(sanitizeQuestion),
      revision: true,
    });
  } catch (error) {
    return handleError(res, "createRevisionQuiz", error);
  }
};

