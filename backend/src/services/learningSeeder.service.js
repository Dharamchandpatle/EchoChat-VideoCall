import Language from "../models/Language.js";
import LearningCategory from "../models/LearningCategory.js";
import Lesson from "../models/Lesson.js";
import LessonVocabulary from "../models/LessonVocabulary.js";
import LevelAssessment from "../models/LevelAssessment.js";
import QuizQuestion from "../models/QuizQuestion.js";

import { CATEGORIES_DATA, LANGUAGES_DATA } from "../lib/learningSeedData.js";
import { HINDI_MARATHI_LESSONS } from "../lib/hindiMarathiLessons.js";
import {
  EASY_ASSESSMENT_QUESTIONS,
  HARD_ASSESSMENT_QUESTIONS,
  MEDIUM_ASSESSMENT_QUESTIONS,
  PRACTICE_QUIZ_QUESTIONS,
} from "../lib/hindiMarathiQuestions.js";

export const seedLearningDatabase = async () => {
  try {
    console.log("Seeding Indian Languages learning content...");

    // 1. Seed Languages (21 Languages)
    for (const lang of LANGUAGES_DATA) {
      await Language.findOneAndUpdate({ code: lang.code }, lang, {
        upsert: true,
        new: true,
      });
    }
    console.log(`Languages seeded: ${LANGUAGES_DATA.length}`);

    // 2. Seed Learning Categories (15 Practical Topics)
    const categoryMap = new Map();
    for (const cat of CATEGORIES_DATA) {
      const savedCat = await LearningCategory.findOneAndUpdate({ slug: cat.slug }, cat, {
        upsert: true,
        new: true,
      });
      categoryMap.set(cat.slug, savedCat._id);
    }
    console.log(`Categories seeded: ${CATEGORIES_DATA.length}`);

    // 3. Seed Lessons & Vocabulary (Hindi -> Marathi)
    for (const lessonData of HINDI_MARATHI_LESSONS) {
      const categoryId = categoryMap.get(lessonData.categorySlug);
      if (!categoryId) continue;

      const lesson = await Lesson.findOneAndUpdate(
        {
          sourceLanguage: "hi",
          targetLanguage: "mr",
          category: categoryId,
          level: lessonData.level,
        },
        {
          title: lessonData.title,
          description: lessonData.description,
          category: categoryId,
          sourceLanguage: "hi",
          targetLanguage: "mr",
          level: lessonData.level,
          order: lessonData.order,
          grammarNotes: lessonData.grammarNotes || "",
          isPublished: true,
        },
        { upsert: true, new: true }
      );

      // Seed vocabulary
      if (lessonData.vocabulary && lessonData.vocabulary.length > 0) {
        for (const vocab of lessonData.vocabulary) {
          await LessonVocabulary.findOneAndUpdate(
            {
              lesson: lesson._id,
              sourceText: vocab.sourceText,
            },
            {
              lesson: lesson._id,
              category: categoryId,
              sourceText: vocab.sourceText,
              targetText: vocab.targetText,
              romanized: vocab.romanized,
              partOfSpeech: vocab.partOfSpeech || "phrase",
              exampleSource: vocab.exampleSource || "",
              exampleTarget: vocab.exampleTarget || "",
              exampleRomanized: vocab.exampleRomanized || "",
              order: vocab.order || 1,
            },
            { upsert: true, new: true }
          );
        }
      }
    }
    console.log("Hindi -> Marathi lessons & vocabulary seeded.");

    // 4. Seed Practice Quiz Questions
    for (const q of PRACTICE_QUIZ_QUESTIONS) {
      const categoryId = categoryMap.get(q.categorySlug);
      await QuizQuestion.findOneAndUpdate(
        {
          sourceLanguage: "hi",
          targetLanguage: "mr",
          question: q.question,
          isAssessment: false,
        },
        {
          ...q,
          sourceLanguage: "hi",
          targetLanguage: "mr",
          category: categoryId,
          isActive: true,
        },
        { upsert: true, new: true }
      );
    }
    console.log(`Practice quiz questions seeded: ${PRACTICE_QUIZ_QUESTIONS.length}`);

    // 5. Seed Level Assessments & Assessment Questions
    const assessments = [
      {
        level: "easy",
        title: "Level 1: Easy Final Assessment",
        description: "Comprehensive 10-question test evaluating basic greetings, numbers, and vocabulary.",
        questionCount: 10,
        passingPercentage: 60,
        timeLimitMinutes: 15,
        questions: EASY_ASSESSMENT_QUESTIONS,
      },
      {
        level: "medium",
        title: "Level 2: Medium Final Assessment",
        description: "Comprehensive 15-question test evaluating food, transit, sentence formation, and practical dialogs.",
        questionCount: 15,
        passingPercentage: 60,
        timeLimitMinutes: 20,
        questions: MEDIUM_ASSESSMENT_QUESTIONS,
      },
      {
        level: "hard",
        title: "Level 3: Hard Final Assessment",
        description: "Comprehensive 20-question test evaluating advanced grammar, workplace communication, and comprehension.",
        questionCount: 20,
        passingPercentage: 60,
        timeLimitMinutes: 25,
        questions: HARD_ASSESSMENT_QUESTIONS,
      },
    ];

    for (const a of assessments) {
      await LevelAssessment.findOneAndUpdate(
        {
          sourceLanguage: "hi",
          targetLanguage: "mr",
          level: a.level,
        },
        {
          sourceLanguage: "hi",
          targetLanguage: "mr",
          level: a.level,
          title: a.title,
          description: a.description,
          questionCount: a.questionCount,
          passingPercentage: a.passingPercentage,
          timeLimitMinutes: a.timeLimitMinutes,
          isPublished: true,
        },
        { upsert: true, new: true }
      );

      for (const q of a.questions) {
        await QuizQuestion.findOneAndUpdate(
          {
            sourceLanguage: "hi",
            targetLanguage: "mr",
            question: q.question,
            isAssessment: true,
          },
          {
            ...q,
            sourceLanguage: "hi",
            targetLanguage: "mr",
            isAssessment: true,
            isActive: true,
          },
          { upsert: true, new: true }
        );
      }
    }
    console.log("All Level Assessments seeded successfully.");

    return {
      success: true,
      languagesCount: LANGUAGES_DATA.length,
      categoriesCount: CATEGORIES_DATA.length,
      practiceQuestionsCount: PRACTICE_QUIZ_QUESTIONS.length,
      assessmentQuestionsCount:
        EASY_ASSESSMENT_QUESTIONS.length +
        MEDIUM_ASSESSMENT_QUESTIONS.length +
        HARD_ASSESSMENT_QUESTIONS.length,
    };
  } catch (error) {
    console.error("Error seeding learning database:", error);
    throw error;
  }
};
