// Administrator learning-content management with validation, duplicate prevention, and
// safe updates. Content is deactivated rather than deleted, so learner history stays valid.
import mongoose from "mongoose";
import Language from "../models/Language.js";
import LearningCategory from "../models/LearningCategory.js";
import Lesson from "../models/Lesson.js";
import LessonVocabulary from "../models/LessonVocabulary.js";
import QuizQuestion from "../models/QuizQuestion.js";
import {
  validateLanguageInput,
  validateLanguagePair,
  validateLesson,
  validateQuestion,
  questionDuplicateKey,
} from "../lib/contentValidation.js";
import { SUPPORTED_LANGUAGES } from "../lib/supportedLanguages.js";

const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const fail = (res, label, error) => {
  console.error(`${label} error:`, error.message);
  return res.status(500).json({ message: "Internal server error" });
};
const badId = (res, what) => res.status(400).json({ message: `Invalid ${what} id` });

// Every language code used by content must be a supported code AND an active Language document.
const ensureActiveLanguages = async (...codes) => {
  const known = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
  const bad = codes.filter((c) => !known.has(c));
  if (bad.length) return `Unsupported language code(s): ${bad.join(", ")}`;
  const active = await Language.find({ code: { $in: codes }, isActive: true }).select("code").lean();
  const activeSet = new Set(active.map((a) => a.code));
  const inactive = codes.filter((c) => !activeSet.has(c));
  if (inactive.length) return `Language(s) not configured or inactive: ${inactive.join(", ")}`;
  return null;
};

// ---- Listing ------------------------------------------------------------------

const LIST_CONFIG = {
  languages: { model: Language, sort: { order: 1 }, filter: (q) => (q.active === "false" ? { isActive: false } : {}) },
  categories: { model: LearningCategory, sort: { level: 1, order: 1 }, filter: (q) => (q.level ? { level: q.level } : {}) },
  lessons: {
    model: Lesson,
    sort: { sourceLanguage: 1, targetLanguage: 1, level: 1, order: 1 },
    filter: (q) => {
      const f = {};
      if (q.sourceLanguage) f.sourceLanguage = q.sourceLanguage;
      if (q.targetLanguage) f.targetLanguage = q.targetLanguage;
      if (q.level) f.level = q.level;
      return f;
    },
  },
  questions: {
    model: QuizQuestion,
    sort: { level: 1, createdAt: -1 },
    filter: (q) => {
      const f = {};
      if (q.sourceLanguage) f.sourceLanguage = q.sourceLanguage;
      if (q.targetLanguage) f.targetLanguage = q.targetLanguage;
      if (q.level) f.level = q.level;
      if (q.type) f.type = q.type;
      if (q.isAssessment === "true") f.isAssessment = true;
      if (q.isAssessment === "false") f.isAssessment = false;
      return f;
    },
  },
};

export const listContent = (collection) => async (req, res) => {
  try {
    const config = LIST_CONFIG[collection];
    if (!config) return res.status(404).json({ message: "Unknown content collection" });
    const page = clampInt(req.query.page, 1, 100000, 1);
    const limit = clampInt(req.query.limit, 1, 100, 20);
    const filter = config.filter(req.query);
    const [items, total] = await Promise.all([
      config.model.find(filter).sort(config.sort).skip((page - 1) * limit).limit(limit).lean(),
      config.model.countDocuments(filter),
    ]);
    return res.status(200).json({ items, page, limit, total, hasMore: page * limit < total });
  } catch (error) {
    return fail(res, `list ${collection}`, error);
  }
};

// ---- Languages --------------------------------------------------------------

export const saveLanguage = async (req, res) => {
  try {
    const checked = validateLanguageInput(req.body);
    if (checked.error) return res.status(400).json({ message: checked.error });
    if (!SUPPORTED_LANGUAGES.some((l) => l.code === checked.value.code)) {
      return res.status(400).json({ message: `Language code "${checked.value.code}" is not in the supported language list` });
    }
    const language = await Language.findOneAndUpdate({ code: checked.value.code }, checked.value, { upsert: true, new: true, runValidators: true });
    return res.status(200).json({ success: true, language });
  } catch (error) {
    return fail(res, "saveLanguage", error);
  }
};

// ---- Lessons ----------------------------------------------------------------

const lessonDuplicate = (value, excludeId) =>
  Lesson.exists({
    _id: excludeId ? { $ne: excludeId } : { $exists: true },
    title: value.title,
    sourceLanguage: value.sourceLanguage,
    targetLanguage: value.targetLanguage,
    level: value.level,
  });

const replaceVocabulary = async (lessonId, categoryId, vocabulary) => {
  if (!Array.isArray(vocabulary)) return null;
  const rows = [];
  for (const [index, v] of vocabulary.slice(0, 200).entries()) {
    const sourceText = typeof v?.sourceText === "string" ? v.sourceText.trim() : "";
    const targetText = typeof v?.targetText === "string" ? v.targetText.trim() : "";
    if (!sourceText || !targetText) return `vocabulary[${index}] needs sourceText and targetText`;
    rows.push({
      lesson: lessonId,
      category: categoryId,
      sourceText,
      targetText,
      romanized: typeof v.romanized === "string" ? v.romanized.trim() : "",
      partOfSpeech: typeof v.partOfSpeech === "string" ? v.partOfSpeech.trim() : "phrase",
      exampleSource: typeof v.exampleSource === "string" ? v.exampleSource.trim() : "",
      exampleTarget: typeof v.exampleTarget === "string" ? v.exampleTarget.trim() : "",
      exampleRomanized: typeof v.exampleRomanized === "string" ? v.exampleRomanized.trim() : "",
      order: Number.isInteger(v.order) && v.order > 0 ? v.order : index + 1,
    });
  }
  // Upsert by sourceText so re-saving a lesson does not duplicate vocabulary rows.
  for (const row of rows) {
    await LessonVocabulary.updateOne({ lesson: lessonId, sourceText: row.sourceText }, { $set: row }, { upsert: true });
  }
  return null;
};

export const createLesson = async (req, res) => {
  try {
    const body = req.body ?? {};
    const checked = validateLesson(body);
    if (checked.error) return res.status(400).json({ message: checked.error });
    if (!mongoose.isValidObjectId(body.category)) return res.status(400).json({ message: "category must be a valid category id" });
    if (!(await LearningCategory.exists({ _id: body.category }))) return res.status(400).json({ message: "category does not exist" });

    const langError = await ensureActiveLanguages(checked.value.sourceLanguage, checked.value.targetLanguage);
    if (langError) return res.status(400).json({ message: langError });
    if (await lessonDuplicate(checked.value)) {
      return res.status(409).json({ message: "A lesson with this title already exists for this language pair and level" });
    }

    const lesson = await Lesson.create({ ...checked.value, category: body.category });
    const vocabError = await replaceVocabulary(lesson._id, body.category, body.vocabulary);
    if (vocabError) {
      await Lesson.deleteOne({ _id: lesson._id });
      return res.status(400).json({ message: vocabError });
    }
    return res.status(201).json({ success: true, lesson });
  } catch (error) {
    return fail(res, "createLesson", error);
  }
};

export const updateLesson = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return badId(res, "lesson");
    const existing = await Lesson.findById(id).lean();
    if (!existing) return res.status(404).json({ message: "Lesson not found" });

    const merged = { ...existing, ...req.body, sourceLanguage: req.body?.sourceLanguage ?? existing.sourceLanguage, targetLanguage: req.body?.targetLanguage ?? existing.targetLanguage };
    const checked = validateLesson(merged);
    if (checked.error) return res.status(400).json({ message: checked.error });

    const langError = await ensureActiveLanguages(checked.value.sourceLanguage, checked.value.targetLanguage);
    if (langError) return res.status(400).json({ message: langError });
    if (await lessonDuplicate(checked.value, id)) {
      return res.status(409).json({ message: "Another lesson already uses this title for this language pair and level" });
    }

    const lesson = await Lesson.findByIdAndUpdate(id, { $set: checked.value }, { new: true, runValidators: true });
    const vocabError = await replaceVocabulary(lesson._id, lesson.category, req.body?.vocabulary);
    if (vocabError) return res.status(400).json({ message: vocabError });
    return res.status(200).json({ success: true, lesson });
  } catch (error) {
    return fail(res, "updateLesson", error);
  }
};

// ---- Quiz questions -----------------------------------------------------------

export const createQuestion = async (req, res) => {
  try {
    const checked = validateQuestion(req.body);
    if (checked.error) return res.status(400).json({ message: checked.error });

    const langError = await ensureActiveLanguages(checked.value.sourceLanguage, checked.value.targetLanguage);
    if (langError) return res.status(400).json({ message: langError });

    const duplicate = await QuizQuestion.findOne({
      sourceLanguage: checked.value.sourceLanguage,
      targetLanguage: checked.value.targetLanguage,
      level: checked.value.level,
      type: checked.value.type,
      question: { $regex: `^${checked.value.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    })
      .select("_id")
      .lean();
    if (duplicate) return res.status(409).json({ message: "An identical question already exists for this language pair, level, and type" });

    const category = req.body.category ? req.body.category : undefined;
    if (category && !(await LearningCategory.exists({ _id: category }))) {
      return res.status(400).json({ message: "category does not exist" });
    }

    const created = await QuizQuestion.create({ ...checked.value, category, isActive: true });
    return res.status(201).json({ success: true, question: created });
  } catch (error) {
    return fail(res, "createQuestion", error);
  }
};

// Updates re-validate the complete merged question, so a partial edit cannot leave bad data behind.
export const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return badId(res, "question");
    const existing = await QuizQuestion.findById(id).lean();
    if (!existing) return res.status(404).json({ message: "Question not found" });

    const merged = {
      type: existing.type,
      level: existing.level,
      sourceLanguage: existing.sourceLanguage,
      targetLanguage: existing.targetLanguage,
      question: existing.question,
      prompt: existing.prompt,
      audioText: existing.audioText,
      explanation: existing.explanation,
      isAssessment: existing.isAssessment,
      points: existing.points,
      options: existing.options,
      correctAnswer: existing.correctAnswer,
      pairs: existing.pairs,
      wordsToArrange: existing.wordsToArrange,
      correctOrder: existing.correctOrder,
      ...req.body,
    };
    const checked = validateQuestion(merged);
    if (checked.error) return res.status(400).json({ message: checked.error });

    const langError = await ensureActiveLanguages(checked.value.sourceLanguage, checked.value.targetLanguage);
    if (langError) return res.status(400).json({ message: langError });

    const clash = await QuizQuestion.find({
      _id: { $ne: id },
      sourceLanguage: checked.value.sourceLanguage,
      targetLanguage: checked.value.targetLanguage,
      level: checked.value.level,
      type: checked.value.type,
    })
      .select("question")
      .lean();
    const key = questionDuplicateKey(checked.value);
    if (clash.some((c) => questionDuplicateKey({ ...checked.value, question: c.question }) === key)) {
      return res.status(409).json({ message: "Another question has the same text for this language pair, level, and type" });
    }

    // Never write the answer key into the response beyond what the admin already submitted.
    const updated = await QuizQuestion.findByIdAndUpdate(id, { $set: checked.value }, { new: true, runValidators: true }).lean();
    return res.status(200).json({ success: true, question: updated });
  } catch (error) {
    return fail(res, "updateQuestion", error);
  }
};

// Deactivate or reactivate without deleting. Learner history keeps referring to the question.
export const setQuestionActive = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return badId(res, "question");
    if (typeof req.body?.isActive !== "boolean") return res.status(400).json({ message: "isActive must be true or false" });
    const updated = await QuizQuestion.findByIdAndUpdate(id, { $set: { isActive: req.body.isActive } }, { new: true }).select("-correctAnswer -explanation").lean();
    if (!updated) return res.status(404).json({ message: "Question not found" });
    return res.status(200).json({ success: true, question: updated });
  } catch (error) {
    return fail(res, "setQuestionActive", error);
  }
};

// Used by the content validation tests and by the admin UI to check a pair before saving.
export const checkLanguagePair = (req, res) => {
  const checked = validateLanguagePair(req.body?.sourceLanguage, req.body?.targetLanguage);
  if (checked.error) return res.status(400).json({ valid: false, message: checked.error });
  return res.status(200).json({ valid: true, ...checked.value });
};
