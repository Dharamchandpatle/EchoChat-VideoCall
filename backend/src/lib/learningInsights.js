// Pure calculations for goals, analytics, and revision. No database access, so they are unit-testable.

const DAY_MS = 24 * 60 * 60 * 1000;

// Start of the UTC day containing `date`. Goals and streaks use UTC day boundaries.
export const startOfUtcDay = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

// Daily goal progress. Targets of 0 mean "not tracked" and count as met.
export const goalProgress = ({ lessonsToday, quizzesToday, dailyLessons, dailyQuizzes }) => {
  const lessonsRemaining = Math.max(0, dailyLessons - lessonsToday);
  const quizzesRemaining = Math.max(0, dailyQuizzes - quizzesToday);
  return {
    lessons: { done: lessonsToday, target: dailyLessons, remaining: lessonsRemaining, met: lessonsRemaining === 0 },
    quizzes: { done: quizzesToday, target: dailyQuizzes, remaining: quizzesRemaining, met: quizzesRemaining === 0 },
    allMet: lessonsRemaining === 0 && quizzesRemaining === 0,
  };
};

// A streak is "at risk" when the user has a current streak but was not active yet today (UTC).
export const streakAtRisk = ({ currentStreak, lastActiveDate, now = new Date() }) => {
  if (!currentStreak || currentStreak <= 0 || !lastActiveDate) return false;
  return new Date(lastActiveDate).getTime() < startOfUtcDay(now).getTime();
};

// Summarizes quiz attempts. Each attempt: { totalQuestions, correctAnswers, timeTakenSeconds, category }.
// Accuracy is correct answers over answered questions. Old attempts without counts are skipped.
export const summarizeAttempts = (attempts) => {
  let totalQuestions = 0;
  let correctAnswers = 0;
  let timeSpentSeconds = 0;
  const byCategory = new Map();

  for (const a of attempts) {
    if (!Number.isInteger(a.totalQuestions) || a.totalQuestions <= 0) continue;
    const correct = Number.isInteger(a.correctAnswers) ? a.correctAnswers : 0;
    totalQuestions += a.totalQuestions;
    correctAnswers += correct;
    timeSpentSeconds += Number.isFinite(a.timeTakenSeconds) ? a.timeTakenSeconds : 0;
    if (a.category) {
      const key = String(a.category);
      const bucket = byCategory.get(key) || { total: 0, correct: 0 };
      bucket.total += a.totalQuestions;
      bucket.correct += correct;
      byCategory.set(key, bucket);
    }
  }

  return {
    attempts: attempts.length,
    totalQuestions,
    correctAnswers,
    incorrectAnswers: totalQuestions - correctAnswers,
    accuracy: percent(correctAnswers, totalQuestions),
    // Only quiz time is measured. Lesson reading time is not tracked, so it is not reported.
    quizTimeSeconds: timeSpentSeconds,
    byCategory,
  };
};

// Weakest categories first. Requires a minimum sample so one bad quiz does not dominate.
export const weakestCategories = (byCategory, { minQuestions = 5, limit = 3 } = {}) =>
  [...byCategory.entries()]
    .filter(([, v]) => v.total >= minQuestions)
    .map(([categoryId, v]) => ({ categoryId, answered: v.total, correct: v.correct, accuracy: percent(v.correct, v.total) }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);

// Collects incorrectly answered question IDs from attempts (newest first), de-duplicated.
export const collectIncorrect = (attempts, limit = 50) => {
  const seen = new Set();
  const out = [];
  for (const attempt of attempts) {
    for (const answer of attempt.answers || []) {
      if (answer.isCorrect !== false || answer.unavailable) continue;
      const id = String(answer.questionId);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        questionId: id,
        questionText: answer.questionText || "",
        type: answer.type || "",
        lastWrongAt: attempt.createdAt,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
};

export const isValidWordInput = (word) => typeof word === "string" && word.trim().length > 0 && word.trim().length <= 120;
