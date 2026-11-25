import mongoose from "mongoose";
import Language from "../models/Language.js";
import QuizSession from "../models/QuizSession.js";
import { gradeAnswers } from "../lib/learningGrading.js";
import LearningCategory from "../models/LearningCategory.js";
import Lesson from "../models/Lesson.js";
import LessonVocabulary from "../models/LessonVocabulary.js";
import LevelAssessment from "../models/LevelAssessment.js";
import QuizAttempt from "../models/QuizAttempt.js";
import QuizQuestion from "../models/QuizQuestion.js";
import User from "../models/User.js";
import UserAchievement from "../models/UserAchievement.js";
import UserLanguageProgress from "../models/UserLanguageProgress.js";
import UserLessonProgress from "../models/UserLessonProgress.js";
import UserReward from "../models/UserReward.js";

// Calculate stars according to Requirement 7 table
export const calculateStarsForScore = (percentage) => {
  if (percentage >= 95) return 5;
  if (percentage >= 80) return 3;
  if (percentage >= 60) return 2;
  if (percentage >= 40) return 1;
  return 0;
};

// Streak calculation helper
export const applyStreakUpdate = (progress) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lastActive = progress.streak?.lastActiveDate
    ? new Date(progress.streak.lastActiveDate)
    : null;

  if (!lastActive) {
    progress.streak = {
      current: 1,
      longest: 1,
      lastActiveDate: now,
    };
  } else {
    const lastDay = new Date(
      lastActive.getFullYear(),
      lastActive.getMonth(),
      lastActive.getDate()
    ).getTime();
    const diffDays = Math.round((today - lastDay) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // consecutive day!
      progress.streak.current = (progress.streak.current || 0) + 1;
      if (progress.streak.current > (progress.streak.longest || 0)) {
        progress.streak.longest = progress.streak.current;
      }
      progress.streak.lastActiveDate = now;
    } else if (diffDays === 0) {
      // same day, maintain
      progress.streak.lastActiveDate = now;
    } else {
      // streak broke
      progress.streak.current = 1;
      progress.streak.lastActiveDate = now;
    }
  }
  progress.lastLearnedAt = now;
};

// Check and award achievements helper
const checkAndAwardAchievements = async (userId, context = {}) => {
  const awards = [];

  const grantBadge = async (badgeId, title, description, icon = "Award") => {
    const existing = await UserAchievement.findOne({ user: userId, badgeId });
    if (!existing) {
      const created = await UserAchievement.create({
        user: userId,
        badgeId,
        title,
        description,
        icon,
      });
      awards.push(created);
    }
  };

  if (context.event === "lesson_completed") {
    await grantBadge("first_lesson", "First Step", "Completed your very first Indian language lesson!", "BookOpen");
    const count = await UserLessonProgress.countDocuments({ user: userId, isCompleted: true });
    if (count >= 5) {
      await grantBadge("lesson_enthusiast", "Language Enthusiast", "Completed 5 language lessons!", "Sparkles");
    }
    if (count >= 15) {
      await grantBadge("polyglot_scholar", "Dedicated Scholar", "Completed all 15 core language topics!", "GraduationCap");
    }
  }

  if (context.event === "assessment_passed") {
    if (context.level === "easy") {
      await grantBadge("easy_master", "Easy Explorer", "Passed the Level 1 Easy Final Assessment with 60%+!", "Trophy");
    }
    if (context.level === "medium") {
      await grantBadge("medium_master", "Fluent Conversationalist", "Passed the Level 2 Medium Assessment with 60%+!", "Trophy");
    }
    if (context.level === "hard") {
      await grantBadge("hard_champion", "Language Champion", "Passed the Level 3 Hard Assessment with 60%+!", "Crown");
    }
    if (context.scorePercentage === 100) {
      await grantBadge("perfect_score", "Flawless Performance", "Achieved 100% on a Final Level Assessment!", "Zap");
    }
  }

  if (context.totalStars >= 5) {
    await grantBadge("star_gazer", "Star Collector", "Earned 5+ total stars across language assessments!", "Star");
  }
  if (context.totalStars >= 10) {
    await grantBadge("master_stargazer", "Galaxy Achiever", "Earned 10+ stars in your language learning journey!", "Sparkles");
  }

  if (context.streak >= 3) {
    await grantBadge("streak_starter", "On Fire", "Maintained a 3-day active learning streak!", "Flame");
  }

  return awards;
};

// 1. Get all languages
export const getLanguages = async (req, res) => {
  try {
    const languages = await Language.find({ isActive: true }).sort({ order: 1 });
    res.status(200).json(languages);
  } catch (error) {
    console.error("Error in getLanguages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 2. Get current active selection
export const getUserLanguageSelection = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("activeLanguagePair");
    const nativeCode = user?.activeLanguagePair?.nativeLanguage || "hi";
    const targetCode = user?.activeLanguagePair?.targetLanguage || "mr";

    const nativeLang = await Language.findOne({ code: nativeCode });
    const targetLang = await Language.findOne({ code: targetCode });

    res.status(200).json({
      nativeLanguage: nativeLang || { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
      targetLanguage: targetLang || { code: "mr", name: "Marathi", nativeName: "मराठी" },
    });
  } catch (error) {
    console.error("Error in getUserLanguageSelection:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 3. Select language pair (Native != Target)
export const selectLanguagePair = async (req, res) => {
  try {
    const { nativeLanguage, targetLanguage } = req.body ?? {};

    if (typeof nativeLanguage !== "string" || typeof targetLanguage !== "string" || !nativeLanguage || !targetLanguage) {
      return res.status(400).json({ message: "Both native and target languages are required" });
    }

    if (nativeLanguage.toLowerCase() === targetLanguage.toLowerCase()) {
      return res.status(400).json({
        message: "Native language and target language cannot be the same",
      });
    }

    const nativeLang = await Language.findOne({ code: nativeLanguage.toLowerCase(), isActive: true });
    const targetLang = await Language.findOne({ code: targetLanguage.toLowerCase(), isActive: true });

    if (!nativeLang || !targetLang) {
      return res.status(404).json({ message: "Selected language is not supported or active" });
    }

    await User.findByIdAndUpdate(req.user._id, {
      "activeLanguagePair.nativeLanguage": nativeLang.code,
      "activeLanguagePair.targetLanguage": targetLang.code,
    });

    let progress = await UserLanguageProgress.findOne({
      user: req.user._id,
      nativeLanguage: nativeLang.code,
      targetLanguage: targetLang.code,
    });

    if (!progress) {
      progress = await UserLanguageProgress.create({
        user: req.user._id,
        nativeLanguage: nativeLang.code,
        targetLanguage: targetLang.code,
        currentLevel: "easy",
        unlockedLevels: ["easy"],
        totalStars: 0,
        levelStars: { easy: 0, medium: 0, hard: 0 },
        levelBestScores: { easy: 0, medium: 0, hard: 0 },
        streak: { current: 1, longest: 1, lastActiveDate: new Date() },
      });
    }

    // Tell the client honestly whether this pair has a course yet; many configured languages do not.
    const publishedLessons = await Lesson.countDocuments({
      sourceLanguage: nativeLang.code,
      targetLanguage: targetLang.code,
      isPublished: true,
    });

    res.status(200).json({
      success: true,
      message: "Language pair updated successfully",
      nativeLanguage: nativeLang,
      targetLanguage: targetLang,
      progress,
      contentAvailable: publishedLessons > 0,
      publishedLessons,
    });
  } catch (error) {
    console.error("Error in selectLanguagePair:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 4. Learning Dashboard
export const getLearningDashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const nativeCode = user?.activeLanguagePair?.nativeLanguage || "hi";
    const targetCode = user?.activeLanguagePair?.targetLanguage || "mr";

    const nativeLang = await Language.findOne({ code: nativeCode });
    const targetLang = await Language.findOne({ code: targetCode });

    let progress = await UserLanguageProgress.findOne({
      user: req.user._id,
      nativeLanguage: nativeCode,
      targetLanguage: targetCode,
    });

    if (!progress) {
      progress = await UserLanguageProgress.create({
        user: req.user._id,
        nativeLanguage: nativeCode,
        targetLanguage: targetCode,
        currentLevel: "easy",
        unlockedLevels: ["easy"],
        totalStars: 0,
        levelStars: { easy: 0, medium: 0, hard: 0 },
        levelBestScores: { easy: 0, medium: 0, hard: 0 },
        streak: { current: 0, longest: 0, lastActiveDate: null },
      });
    }

    // Total lessons and completed lessons count
    const totalLessonsCount = await Lesson.countDocuments({
      sourceLanguage: nativeCode,
      targetLanguage: targetCode,
      isPublished: true,
    });

    const completedLessonsCount = await UserLessonProgress.countDocuments({
      user: req.user._id,
      sourceLanguage: nativeCode,
      targetLanguage: targetCode,
      isCompleted: true,
    });

    // Quiz completion stats
    const quizzesTakenCount = await UserLessonProgress.countDocuments({
      user: req.user._id,
      sourceLanguage: nativeCode,
      targetLanguage: targetCode,
      quizCompleted: true,
    });

    const quizPercentage =
      totalLessonsCount > 0 ? Math.round((quizzesTakenCount / totalLessonsCount) * 100) : 0;

    // Overall progress: 40% lessons + 30% practice quizzes + 30% level tests
    const passedLevelsCount = ["easy", "medium", "hard"].filter(
      (lvl) => (progress.levelBestScores?.[lvl] || 0) >= 60
    ).length;

    const lessonWeight = totalLessonsCount > 0 ? (completedLessonsCount / totalLessonsCount) * 40 : 0;
    const quizWeight = totalLessonsCount > 0 ? (quizzesTakenCount / totalLessonsCount) * 30 : 0;
    const testWeight = (passedLevelsCount / 3) * 30;
    const overallProgress = Math.min(100, Math.round(lessonWeight + quizWeight + testWeight));

    // Level status cards
    const levels = [
      {
        id: "easy",
        name: "Level 1: EASY",
        description: "Basic vocabulary, greetings, numbers, and short everyday expressions.",
        isUnlocked: true,
        isCompleted: (progress.levelBestScores?.easy || 0) >= 60,
        starsEarned: progress.levelStars?.easy || 0,
        bestScore: progress.levelBestScores?.easy || 0,
        questionsCount: 10,
        passingScore: 60,
      },
      {
        id: "medium",
        name: "Level 2: MEDIUM",
        description: "Sentence formation, everyday conversations, food, transit, and practical phrases.",
        isUnlocked: progress.unlockedLevels.includes("medium"),
        isCompleted: (progress.levelBestScores?.medium || 0) >= 60,
        starsEarned: progress.levelStars?.medium || 0,
        bestScore: progress.levelBestScores?.medium || 0,
        unlockRequirement: "Pass Easy Final Assessment with at least 60%",
        questionsCount: 15,
        passingScore: 60,
      },
      {
        id: "hard",
        name: "Level 3: HARD",
        description: "Advanced vocabulary, complex sentence structures, grammar rules, and workplace discourse.",
        isUnlocked: progress.unlockedLevels.includes("hard"),
        isCompleted: (progress.levelBestScores?.hard || 0) >= 60,
        starsEarned: progress.levelStars?.hard || 0,
        bestScore: progress.levelBestScores?.hard || 0,
        unlockRequirement: "Pass Medium Final Assessment with at least 60%",
        questionsCount: 20,
        passingScore: 60,
      },
    ];

    // User achievements
    const achievements = await UserAchievement.find({ user: req.user._id }).sort({ unlockedAt: -1 });

    res.status(200).json({
      nativeLanguage: nativeLang,
      targetLanguage: targetLang,
      progress: {
        currentLevel: progress.currentLevel,
        unlockedLevels: progress.unlockedLevels,
        totalStars: progress.totalStars,
        levelStars: progress.levelStars,
        levelBestScores: progress.levelBestScores,
        streak: progress.streak,
        completedLessonsCount,
        totalLessonsCount,
        quizPercentage,
        overallProgress,
      },
      levels,
      achievements,
    });
  } catch (error) {
    console.error("Error in getLearningDashboard:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 5. Get Categories for a level
export const getCategoriesByLevel = async (req, res) => {
  try {
    const { level } = req.query;
    const user = await User.findById(req.user._id);
    const nativeCode = user?.activeLanguagePair?.nativeLanguage || "hi";
    const targetCode = user?.activeLanguagePair?.targetLanguage || "mr";

    const filter = { isActive: true };
    if (level && ["easy", "medium", "hard"].includes(level)) {
      filter.level = level;
    }

    const categories = await LearningCategory.find(filter).sort({ order: 1 });

    // Find user's lesson progress for these categories
    const categoryIds = categories.map((c) => c._id);
    const progressList = await UserLessonProgress.find({
      user: req.user._id,
      sourceLanguage: nativeCode,
      targetLanguage: targetCode,
      category: { $in: categoryIds },
    });

    const progressMap = new Map();
    progressList.forEach((p) => {
      progressMap.set(p.category.toString(), p);
    });

    const result = categories.map((cat) => {
      const userProg = progressMap.get(cat._id.toString());
      return {
        _id: cat._id,
        slug: cat.slug,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        level: cat.level,
        order: cat.order,
        isCompleted: userProg?.isCompleted || false,
        quizCompleted: userProg?.quizCompleted || false,
        quizBestScore: userProg?.quizBestScore || 0,
      };
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getCategoriesByLevel:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 6. Get Lesson details & vocabulary
export const getLessonDetails = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const user = await User.findById(req.user._id);
    const nativeCode = user?.activeLanguagePair?.nativeLanguage || "hi";
    const targetCode = user?.activeLanguagePair?.targetLanguage || "mr";

    const category = await LearningCategory.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Only the lesson for the learner's own language pair is served. Showing another pair's lesson
    // (e.g. Hindi→Marathi to someone learning Tamil) would present the wrong language as the course.
    const lesson = await Lesson.findOne({
      category: categoryId,
      sourceLanguage: nativeCode,
      targetLanguage: targetCode,
      isPublished: true,
    });

    if (!lesson) {
      return res.status(404).json({
        message: "There is no lesson for this topic in your selected language pair yet.",
        code: "NO_CONTENT_FOR_PAIR",
        nativeLanguage: nativeCode,
        targetLanguage: targetCode,
      });
    }

    const vocabulary = await LessonVocabulary.find({ lesson: lesson._id }).sort({ order: 1 });

    const userProgress = await UserLessonProgress.findOne({
      user: req.user._id,
      lesson: lesson._id,
    });

    res.status(200).json({
      category,
      lesson,
      vocabulary,
      userProgress: {
        isCompleted: userProgress?.isCompleted || false,
        quizCompleted: userProgress?.quizCompleted || false,
        quizBestScore: userProgress?.quizBestScore || 0,
      },
    });
  } catch (error) {
    console.error("Error in getLessonDetails:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 7. Complete a Lesson
export const completeLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    if (!mongoose.isValidObjectId(lessonId)) {
      return res.status(400).json({ message: "Invalid lesson id" });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson || !lesson.isPublished) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    // A lesson can only be completed within the user's active pair and an unlocked level.
    const { nativeCode, targetCode } = await getActivePair(req.user._id);
    if (lesson.sourceLanguage !== nativeCode || lesson.targetLanguage !== targetCode) {
      return res.status(403).json({ message: "This lesson is not part of your active language pair" });
    }
    const pairProgress = await UserLanguageProgress.findOne({
      user: req.user._id,
      nativeLanguage: nativeCode,
      targetLanguage: targetCode,
    });
    const unlocked = pairProgress?.unlockedLevels?.length ? pairProgress.unlockedLevels : ["easy"];
    if (!unlocked.includes(lesson.level)) {
      return res.status(403).json({ message: `Level ${lesson.level.toUpperCase()} is locked` });
    }

    const userLesson = await UserLessonProgress.findOneAndUpdate(
      { user: req.user._id, lesson: lessonId },
      {
        user: req.user._id,
        lesson: lesson._id,
        category: lesson.category,
        sourceLanguage: lesson.sourceLanguage,
        targetLanguage: lesson.targetLanguage,
        level: lesson.level,
        isCompleted: true,
        completedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Update streak on language progress
    const langProgress = await UserLanguageProgress.findOne({
      user: req.user._id,
      nativeLanguage: lesson.sourceLanguage,
      targetLanguage: lesson.targetLanguage,
    });

    if (langProgress) {
      applyStreakUpdate(langProgress);
      await langProgress.save();
    }

    // Check achievements
    const newAchievements = await checkAndAwardAchievements(req.user._id, {
      event: "lesson_completed",
      streak: langProgress?.streak?.current || 1,
    });

    res.status(200).json({
      success: true,
      message: "Lesson marked as completed!",
      userLesson,
      newAchievements,
    });
  } catch (error) {
    console.error("Error in completeLesson:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// Shared helpers for quizzes and level assessments
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // a quiz must be submitted within 2 hours
const PRACTICE_QUIZ_SIZE = 10;
const ASSESSMENT_SIZE = { easy: 10, medium: 15, hard: 20 };
const PASS_PERCENTAGE = 60;

const shuffle = (items) => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const getActivePair = async (userId) => {
  const user = await User.findById(userId).select("activeLanguagePair").lean();
  return {
    nativeCode: user?.activeLanguagePair?.nativeLanguage || "hi",
    targetCode: user?.activeLanguagePair?.targetLanguage || "mr",
  };
};

// Strips answers, correct order, and explanations before a question is sent to the client.
export const sanitizeQuestion = (q) => ({
  _id: q._id,
  type: q.type,
  question: q.question,
  prompt: q.prompt,
  audioText: q.audioText,
  options: q.options?.length ? shuffle(q.options) : [],
  pairsLeft: q.pairs ? q.pairs.map((p) => p.left) : [],
  matchRightOptions: q.type === "match" && q.pairs?.length ? shuffle(q.pairs.map((p) => p.right)) : [],
  wordsToArrange: q.type === "arrange_words" && q.wordsToArrange?.length ? shuffle(q.wordsToArrange) : [],
  points: q.points || 1,
});

export const createSession = ({ userId, kind, level, categoryId = null, sourceLanguage, targetLanguage, questions }) =>
  QuizSession.create({
    user: userId,
    kind,
    level,
    category: categoryId,
    sourceLanguage,
    targetLanguage,
    questionIds: questions.map((q) => q._id),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

// Returns { session } or { error: { status, message } }. Does not change session state.
const loadOpenSession = async ({ sessionId, userId, kind }) => {
  if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
    return { error: { status: 400, message: "A valid quiz session is required. Please start the quiz again." } };
  }
  const session = await QuizSession.findOne({ _id: sessionId, user: userId, kind });
  if (!session) return { error: { status: 404, message: "Quiz session not found" } };
  if (session.status !== "open") {
    return { error: { status: 409, message: "This quiz has already been submitted" } };
  }
  if (session.expiresAt <= new Date()) {
    return { error: { status: 410, message: "This quiz session has expired. Please start again." } };
  }
  return { session };
};

// Atomically closes the session. Returns false if a concurrent request already closed it.
const claimSession = async (session, userId) => {
  const claimed = await QuizSession.findOneAndUpdate(
    { _id: session._id, user: userId, status: "open" },
    { status: "submitted", submittedAt: new Date() },
    { new: true }
  );
  return Boolean(claimed);
};

// ---------------------------------------------------------------------------
// 8. Practice quiz: issue a session with server-chosen questions
// ---------------------------------------------------------------------------
export const getPracticeQuiz = async (req, res) => {
  try {
    const { categoryId } = req.params;
    if (!mongoose.isValidObjectId(categoryId)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const category = await LearningCategory.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const { nativeCode, targetCode } = await getActivePair(req.user._id);
    const base = { sourceLanguage: nativeCode, targetLanguage: targetCode, isAssessment: false, isActive: true };

    let questions = await QuizQuestion.find({ ...base, category: categoryId });
    if (questions.length < PRACTICE_QUIZ_SIZE) {
      const extra = await QuizQuestion.find({
        ...base,
        _id: { $nin: questions.map((q) => q._id) },
      }).limit(PRACTICE_QUIZ_SIZE - questions.length);
      questions = [...questions, ...extra];
    }
    questions = shuffle(questions).slice(0, PRACTICE_QUIZ_SIZE);

    if (questions.length === 0) {
      return res.status(404).json({ message: "No practice questions are available for this topic yet" });
    }

    const session = await createSession({
      userId: req.user._id,
      kind: "practice",
      level: questions[0].level || "easy",
      categoryId,
      sourceLanguage: nativeCode,
      targetLanguage: targetCode,
      questions,
    });

    return res.status(200).json({
      sessionId: session._id,
      expiresAt: session.expiresAt,
      category,
      totalQuestions: questions.length,
      questions: questions.map(sanitizeQuestion),
    });
  } catch (error) {
    console.error("Error in getPracticeQuiz:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// 9. Submit practice quiz: grade only the session's questions, once
// ---------------------------------------------------------------------------
export const submitPracticeQuiz = async (req, res) => {
  try {
    const { sessionId, answers, timeTakenSeconds } = req.body ?? {};
    const userId = req.user._id;

    const loaded = await loadOpenSession({ sessionId, userId, kind: "practice" });
    if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });
    const { session } = loaded;

    const questions = await QuizQuestion.find({ _id: { $in: session.questionIds } }).lean();
    const graded = gradeAnswers({ sessionQuestionIds: session.questionIds, questions, answers });
    if (graded.error) return res.status(400).json({ message: graded.error });

    if (!(await claimSession(session, userId))) {
      return res.status(409).json({ message: "This quiz has already been submitted" });
    }

    const { totalQuestions, correctCount, incorrectCount, scorePercentage, detailedFeedback } = graded;
    const seconds = Number.isFinite(timeTakenSeconds) && timeTakenSeconds >= 0 ? timeTakenSeconds : 0;

    const attempt = await QuizAttempt.create({
      user: userId,
      sourceLanguage: session.sourceLanguage,
      targetLanguage: session.targetLanguage,
      level: session.level,
      category: session.category,
      type: "practice",
      totalQuestions,
      correctAnswers: correctCount,
      incorrectAnswers: incorrectCount,
      scorePercentage,
      timeTakenSeconds: seconds,
      isPassed: scorePercentage >= PASS_PERCENTAGE,
      answers: detailedFeedback,
    });

    if (session.category) {
      await UserLessonProgress.findOneAndUpdate(
        { user: userId, category: session.category },
        { quizCompleted: true, $max: { quizBestScore: scorePercentage } }
      );
    }

    const langProgress = await UserLanguageProgress.findOne({
      user: userId,
      nativeLanguage: session.sourceLanguage,
      targetLanguage: session.targetLanguage,
    });
    if (langProgress) {
      applyStreakUpdate(langProgress);
      await langProgress.save();
    }

    return res.status(200).json({
      success: true,
      attemptId: attempt._id,
      scorePercentage,
      correctAnswers: correctCount,
      incorrectAnswers: incorrectCount,
      totalQuestions,
      timeTakenSeconds: seconds,
      detailedFeedback,
    });
  } catch (error) {
    console.error("Error in submitPracticeQuiz:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// 10. Level final assessment: enforce unlocks, issue a session
// ---------------------------------------------------------------------------
export const getLevelAssessment = async (req, res) => {
  try {
    const { level } = req.params;
    if (!["easy", "medium", "hard"].includes(level)) {
      return res.status(400).json({ message: "Invalid level specified" });
    }

    const { nativeCode, targetCode } = await getActivePair(req.user._id);

    const progress = await UserLanguageProgress.findOne({
      user: req.user._id,
      nativeLanguage: nativeCode,
      targetLanguage: targetCode,
    });
    const unlockedLevels = progress?.unlockedLevels?.length ? progress.unlockedLevels : ["easy"];
    if (!unlockedLevels.includes(level)) {
      return res.status(403).json({
        message: `Level ${level.toUpperCase()} is locked. You must complete the previous level assessment with at least 60% first.`,
        locked: true,
      });
    }

    const assessmentConfig = await LevelAssessment.findOne({
      sourceLanguage: nativeCode,
      targetLanguage: targetCode,
      level,
      isPublished: true,
    });

    const questions = shuffle(
      await QuizQuestion.find({
        sourceLanguage: nativeCode,
        targetLanguage: targetCode,
        level,
        isAssessment: true,
        isActive: true,
      })
    ).slice(0, ASSESSMENT_SIZE[level]);

    if (questions.length === 0) {
      return res.status(404).json({ message: `No ${level} assessment questions are available yet` });
    }

    const session = await createSession({
      userId: req.user._id,
      kind: "assessment",
      level,
      sourceLanguage: nativeCode,
      targetLanguage: targetCode,
      questions,
    });

    return res.status(200).json({
      sessionId: session._id,
      expiresAt: session.expiresAt,
      level,
      title: assessmentConfig?.title || `Level ${level.toUpperCase()} Final Assessment`,
      description: assessmentConfig?.description || "",
      timeLimitMinutes: assessmentConfig?.timeLimitMinutes || 20,
      totalQuestions: questions.length,
      passingPercentage: PASS_PERCENTAGE,
      questions: questions.map(sanitizeQuestion),
    });
  } catch (error) {
    console.error("Error in getLevelAssessment:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// 11. Submit level assessment: grade the session, award stars, unlock levels
// ---------------------------------------------------------------------------
export const submitLevelAssessment = async (req, res) => {
  try {
    const { sessionId, answers, timeTakenSeconds } = req.body ?? {};
    const userId = req.user._id;

    const loaded = await loadOpenSession({ sessionId, userId, kind: "assessment" });
    if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });
    const { session } = loaded;
    const { level, sourceLanguage: nativeCode, targetLanguage: targetCode } = session;

    let progress = await UserLanguageProgress.findOne({
      user: userId,
      nativeLanguage: nativeCode,
      targetLanguage: targetCode,
    });
    if (!progress) {
      progress = await UserLanguageProgress.create({
        user: userId,
        nativeLanguage: nativeCode,
        targetLanguage: targetCode,
        currentLevel: "easy",
        unlockedLevels: ["easy"],
        totalStars: 0,
        levelStars: { easy: 0, medium: 0, hard: 0 },
        levelBestScores: { easy: 0, medium: 0, hard: 0 },
      });
    }
    if (!progress.unlockedLevels.includes(level)) {
      return res.status(403).json({ message: `Level ${level.toUpperCase()} is locked.` });
    }

    const questions = await QuizQuestion.find({ _id: { $in: session.questionIds } }).lean();
    const graded = gradeAnswers({ sessionQuestionIds: session.questionIds, questions, answers });
    if (graded.error) return res.status(400).json({ message: graded.error });

    if (!(await claimSession(session, userId))) {
      return res.status(409).json({ message: "This assessment has already been submitted" });
    }

    const { totalQuestions, correctCount, incorrectCount, scorePercentage, detailedFeedback } = graded;
    const seconds = Number.isFinite(timeTakenSeconds) && timeTakenSeconds >= 0 ? timeTakenSeconds : 0;
    const earnedStars = calculateStarsForScore(scorePercentage);
    const isPassed = scorePercentage >= PASS_PERCENTAGE;

    const previousBestScore = progress.levelBestScores?.[level] || 0;
    const previousBestStars = progress.levelStars?.[level] || 0;

    const attempt = await QuizAttempt.create({
      user: userId,
      sourceLanguage: nativeCode,
      targetLanguage: targetCode,
      level,
      type: "assessment",
      totalQuestions,
      correctAnswers: correctCount,
      incorrectAnswers: incorrectCount,
      scorePercentage,
      timeTakenSeconds: seconds,
      starsEarned: earnedStars,
      isPassed,
      answers: detailedFeedback,
    });

    // Stars are only awarded for improvements over the previous best for this level.
    let newStarsAwarded = 0;
    if (earnedStars > previousBestStars) {
      newStarsAwarded = earnedStars - previousBestStars;
      progress.totalStars = (progress.totalStars || 0) + newStarsAwarded;
      progress.levelStars[level] = earnedStars;

      await UserReward.create({
        user: userId,
        sourceLanguage: nativeCode,
        targetLanguage: targetCode,
        level,
        assessmentAttempt: attempt._id,
        starsAwarded: newStarsAwarded,
        scorePercentage,
        transactionType: "level_test_star_reward",
      });
    }

    if (scorePercentage > previousBestScore) {
      progress.levelBestScores[level] = scorePercentage;
    }

    // Easy >= 60% unlocks Medium; Medium >= 60% unlocks Hard.
    let nextLevelUnlocked = null;
    if (isPassed) {
      if (level === "easy" && !progress.unlockedLevels.includes("medium")) {
        progress.unlockedLevels.push("medium");
        progress.currentLevel = "medium";
        nextLevelUnlocked = "medium";
      } else if (level === "medium" && !progress.unlockedLevels.includes("hard")) {
        progress.unlockedLevels.push("hard");
        progress.currentLevel = "hard";
        nextLevelUnlocked = "hard";
      }
    }

    applyStreakUpdate(progress);
    await progress.save();

    const newAchievements = await checkAndAwardAchievements(userId, {
      event: isPassed ? "assessment_passed" : "assessment_attempted",
      level,
      scorePercentage,
      totalStars: progress.totalStars,
      streak: progress.streak?.current || 1,
    });

    return res.status(200).json({
      success: true,
      attemptId: attempt._id,
      level,
      totalQuestions,
      correctAnswers: correctCount,
      incorrectAnswers: incorrectCount,
      scorePercentage,
      timeTakenSeconds: seconds,
      starsEarned: earnedStars,
      newStarsAwarded,
      totalStars: progress.totalStars,
      previousBestScore,
      isPassed,
      nextLevelUnlocked,
      newAchievements,
      detailedFeedback,
    });
  } catch (error) {
    console.error("Error in submitLevelAssessment:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 12. Get Stored Assessment Result for Review
export const getAssessmentResult = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const attempt = await QuizAttempt.findOne({
      _id: attemptId,
      user: req.user._id,
    });

    if (!attempt) {
      return res.status(404).json({ message: "Assessment attempt not found" });
    }

    res.status(200).json(attempt);
  } catch (error) {
    console.error("Error in getAssessmentResult:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 13. Get User Learning Profile, History & Achievements
export const getUserLearningProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const nativeCode = user?.activeLanguagePair?.nativeLanguage || "hi";
    const targetCode = user?.activeLanguagePair?.targetLanguage || "mr";

    const progress = await UserLanguageProgress.findOne({
      user: req.user._id,
      nativeLanguage: nativeCode,
      targetLanguage: targetCode,
    });

    const achievements = await UserAchievement.find({ user: req.user._id }).sort({ unlockedAt: -1 });

    const recentAssessments = await QuizAttempt.find({
      user: req.user._id,
      type: "assessment",
    })
      .sort({ createdAt: -1 })
      .limit(10);

    const recentQuizzes = await QuizAttempt.find({
      user: req.user._id,
      type: "practice",
    })
      .populate("category", "name slug")
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      user: {
        _id: user._id,
        fullName: user.fullName,
        profilePic: user.profilePic,
        role: user.role,
      },
      nativeLanguage: nativeCode,
      targetLanguage: targetCode,
      progress,
      achievements,
      recentAssessments,
      recentQuizzes,
    });
  } catch (error) {
    console.error("Error in getUserLearningProfile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
