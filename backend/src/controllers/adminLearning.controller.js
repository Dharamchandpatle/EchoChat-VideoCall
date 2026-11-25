import Language from "../models/Language.js";
import LearningCategory from "../models/LearningCategory.js";
import Lesson from "../models/Lesson.js";
import LessonVocabulary from "../models/LessonVocabulary.js";
import LevelAssessment from "../models/LevelAssessment.js";
import QuizAttempt from "../models/QuizAttempt.js";
import QuizQuestion from "../models/QuizQuestion.js";
import User from "../models/User.js";
import UserLanguageProgress from "../models/UserLanguageProgress.js";
import { seedLearningDatabase } from "../services/learningSeeder.service.js";

// 1. Get Learning System Statistics
export const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeLearners = await UserLanguageProgress.countDocuments();
    const totalLanguages = await Language.countDocuments();
    const totalCategories = await LearningCategory.countDocuments();
    const totalLessons = await Lesson.countDocuments();
    const totalQuestions = await QuizQuestion.countDocuments();
    const totalAttempts = await QuizAttempt.countDocuments();

    const passedAssessments = await QuizAttempt.countDocuments({
      type: "assessment",
      isPassed: true,
    });

    const levelBreakdown = {
      easy: await QuizAttempt.countDocuments({ type: "assessment", level: "easy", isPassed: true }),
      medium: await QuizAttempt.countDocuments({ type: "assessment", level: "medium", isPassed: true }),
      hard: await QuizAttempt.countDocuments({ type: "assessment", level: "hard", isPassed: true }),
    };

    const popularLanguages = await UserLanguageProgress.aggregate([
      { $group: { _id: "$targetLanguage", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    res.status(200).json({
      totalUsers,
      activeLearners,
      totalLanguages,
      totalCategories,
      totalLessons,
      totalQuestions,
      totalAttempts,
      passedAssessments,
      levelBreakdown,
      popularLanguages,
    });
  } catch (error) {
    console.error("Error in getAdminStats:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 2. Trigger Database Seeding
export const triggerSeed = async (req, res) => {
  try {
    const result = await seedLearningDatabase();
    res.status(200).json({
      success: true,
      message: "Learning database seeded successfully!",
      result,
    });
  } catch (error) {
    console.error("Error in triggerSeed:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// 4. Create or Edit Category
export const saveCategory = async (req, res) => {
  try {
    const { slug, name, description, icon, level, order, isActive } = req.body;

    if (!slug || !name) {
      return res.status(400).json({ message: "Slug and Name are required" });
    }

    const category = await LearningCategory.findOneAndUpdate(
      { slug: slug.toLowerCase().trim() },
      {
        slug: slug.toLowerCase().trim(),
        name,
        description: description || "",
        icon: icon || "BookOpen",
        level: level || "easy",
        order: order || 1,
        isActive: isActive !== undefined ? isActive : true,
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, category });
  } catch (error) {
    console.error("Error in saveCategory:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 7. Make Current User Admin (Dev convenience/setup)
export const makeMeAdmin = async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { role: "admin" },
      { new: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "You are now an administrator!",
      user: updated,
    });
  } catch (error) {
    console.error("Error in makeMeAdmin:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
