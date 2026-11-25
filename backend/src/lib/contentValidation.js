// Pure validation for admin-authored learning content. No database access, so it is unit-testable.
// Returns { value } with normalized fields, or { error } with a message for the admin.
import { SUPPORTED_LANGUAGES } from "./supportedLanguages.js";

export const QUESTION_TYPES = ["mcq", "match", "translate", "fill_blank", "correct_sentence", "listen_identify", "arrange_words"];
export const LEVELS = ["easy", "medium", "hard"];
const MAX_QUESTION_LENGTH = 500;
const MAX_ANSWER_LENGTH = 300;

const str = (v) => (typeof v === "string" ? v.trim() : "");
const isCode = (v) => SUPPORTED_LANGUAGES.some((l) => l.code === v);
const norm = (v) => String(v ?? "").normalize("NFC").trim().toLowerCase();

export const validateLanguagePair = (sourceLanguage, targetLanguage) => {
  const source = str(sourceLanguage).toLowerCase();
  const target = str(targetLanguage).toLowerCase();
  if (!isCode(source)) return { error: `sourceLanguage "${sourceLanguage}" is not a supported language code` };
  if (!isCode(target)) return { error: `targetLanguage "${targetLanguage}" is not a supported language code` };
  if (source === target) return { error: "sourceLanguage and targetLanguage must differ" };
  return { value: { sourceLanguage: source, targetLanguage: target } };
};

export const validateQuestion = (input = {}) => {
  const type = str(input.type);
  if (!QUESTION_TYPES.includes(type)) return { error: `type must be one of: ${QUESTION_TYPES.join(", ")}` };

  const level = str(input.level).toLowerCase();
  if (!LEVELS.includes(level)) return { error: "level must be easy, medium, or hard" };

  const pair = validateLanguagePair(input.sourceLanguage, input.targetLanguage);
  if (pair.error) return pair;

  const question = str(input.question);
  if (!question) return { error: "question is required" };
  if (question.length > MAX_QUESTION_LENGTH) return { error: `question must be ${MAX_QUESTION_LENGTH} characters or fewer` };

  const base = {
    type,
    level,
    ...pair.value,
    question,
    prompt: str(input.prompt),
    audioText: str(input.audioText),
    explanation: str(input.explanation),
    isAssessment: Boolean(input.isAssessment),
    points: Number.isInteger(input.points) && input.points > 0 && input.points <= 10 ? input.points : 1,
  };

  if (type === "mcq" || type === "listen_identify") {
    const options = Array.isArray(input.options) ? input.options.map(str).filter(Boolean) : [];
    if (new Set(options.map(norm)).size !== options.length) return { error: "options must be distinct" };
    if (options.length < 2 || options.length > 6) return { error: "options must contain 2 to 6 choices" };
    const answer = str(input.correctAnswer);
    if (!answer) return { error: "correctAnswer is required" };
    if (!options.some((o) => norm(o) === norm(answer))) return { error: "correctAnswer must be one of the options" };
    return { value: { ...base, options, correctAnswer: answer } };
  }

  if (type === "arrange_words") {
    const words = Array.isArray(input.wordsToArrange) ? input.wordsToArrange.map(str).filter(Boolean) : [];
    const order = Array.isArray(input.correctOrder) ? input.correctOrder.map(str).filter(Boolean) : [];
    if (order.length < 2) return { error: "correctOrder must contain at least 2 words" };
    if (words.length !== order.length) return { error: "wordsToArrange must have the same number of words as correctOrder" };
    const sortedWords = [...words].map(norm).sort().join("|");
    const sortedOrder = [...order].map(norm).sort().join("|");
    if (sortedWords !== sortedOrder) return { error: "wordsToArrange must contain exactly the words of correctOrder" };
    return { value: { ...base, wordsToArrange: words, correctOrder: order, correctAnswer: order.join(" ") } };
  }

  if (type === "match") {
    const pairs = Array.isArray(input.pairs)
      ? input.pairs.map((p) => ({ left: str(p?.left), right: str(p?.right) })).filter((p) => p.left && p.right)
      : [];
    if (pairs.length < 2) return { error: "match questions need at least 2 pairs" };
    const lefts = pairs.map((p) => norm(p.left));
    if (new Set(lefts).size !== lefts.length) return { error: "match pairs must have distinct left items" };
    const correctAnswer = Object.fromEntries(pairs.map((p) => [p.left, p.right]));
    return { value: { ...base, pairs, correctAnswer } };
  }

  // translate, fill_blank, correct_sentence: a single expected text answer
  const answer = str(input.correctAnswer);
  if (!answer) return { error: "correctAnswer is required" };
  if (answer.length > MAX_ANSWER_LENGTH) return { error: `correctAnswer must be ${MAX_ANSWER_LENGTH} characters or fewer` };
  return { value: { ...base, correctAnswer: answer } };
};

export const validateLesson = (input = {}) => {
  const title = str(input.title);
  if (!title || title.length > 120) return { error: "title is required (120 characters or fewer)" };
  const level = str(input.level).toLowerCase();
  if (!LEVELS.includes(level)) return { error: "level must be easy, medium, or hard" };
  const pair = validateLanguagePair(input.sourceLanguage, input.targetLanguage);
  if (pair.error) return pair;
  const order = Number.isInteger(input.order) && input.order > 0 ? input.order : 1;
  return {
    value: {
      title,
      description: str(input.description).slice(0, 500),
      level,
      ...pair.value,
      order,
      grammarNotes: str(input.grammarNotes).slice(0, 5000),
      isPublished: input.isPublished !== undefined ? Boolean(input.isPublished) : true,
    },
  };
};

export const validateLanguageInput = (input = {}) => {
  const code = str(input.code).toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(code)) return { error: "code must be an ISO-style language code" };
  const name = str(input.name);
  const nativeName = str(input.nativeName);
  const script = str(input.script);
  if (!name || !nativeName || !script) return { error: "name, nativeName, and script are required" };
  return { value: { code, name, nativeName, script, description: str(input.description).slice(0, 500), isActive: input.isActive !== false } };
};

// Stable key used to detect duplicate questions.
export const questionDuplicateKey = (q) =>
  [q.sourceLanguage, q.targetLanguage, q.level, q.type, norm(q.question)].join("|");
