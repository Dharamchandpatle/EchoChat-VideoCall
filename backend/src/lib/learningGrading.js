// Pure grading logic for practice quizzes and level assessments.
// No database access here so it can be unit tested directly.

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase();

export const isAnswerCorrect = (question, userAnswer) => {
  if (userAnswer === undefined || userAnswer === null) return false;

  switch (question.type) {
    case "arrange_words": {
      if (!Array.isArray(userAnswer) || !Array.isArray(question.correctOrder)) return false;
      return (
        userAnswer.length === question.correctOrder.length &&
        userAnswer.every((word, i) => normalize(word) === normalize(question.correctOrder[i]))
      );
    }
    case "match": {
      const expected = question.correctAnswer;
      if (!expected || typeof expected !== "object" || Array.isArray(expected)) return false;
      if (typeof userAnswer !== "object" || Array.isArray(userAnswer)) return false;
      const keys = Object.keys(expected);
      return keys.length > 0 && keys.every((k) => normalize(userAnswer[k]) === normalize(expected[k]));
    }
    default: {
      if (typeof userAnswer === "object") return false;
      const given = normalize(userAnswer);
      return given !== "" && given === normalize(question.correctAnswer);
    }
  }
};

/**
 * Grades answers against the questions that were actually served (the session).
 * - The denominator is the session size, never the client's answer count.
 * - Unanswered questions count as incorrect.
 * - Answers referencing questions outside the session, or duplicated, are rejected.
 */
export const gradeAnswers = ({ sessionQuestionIds, questions, answers }) => {
  if (!Array.isArray(answers) || answers.length === 0) {
    return { error: "answers must be a non-empty array" };
  }
  if (answers.length > sessionQuestionIds.length) {
    return { error: "More answers were submitted than this quiz contains" };
  }

  const allowed = new Set(sessionQuestionIds.map(String));
  const seen = new Set();
  for (const answer of answers) {
    const id = answer?.questionId;
    if (typeof id !== "string" || !allowed.has(id)) {
      return { error: "An answer references a question that is not part of this quiz" };
    }
    if (seen.has(id)) {
      return { error: "Duplicate answer for the same question" };
    }
    seen.add(id);
  }

  const questionById = new Map(questions.map((q) => [String(q._id), q]));
  const answerById = new Map(answers.map((a) => [a.questionId, a.userAnswer]));

  let correctCount = 0;
  const detailedFeedback = [];

  for (const id of sessionQuestionIds.map(String)) {
    const question = questionById.get(id);
    const hasAnswer = answerById.has(id);
    const userAnswer = hasAnswer ? answerById.get(id) : null;

    if (!question) {
      // Question was deactivated or removed after it was served: counts as incorrect.
      detailedFeedback.push({ questionId: id, userAnswer, isCorrect: false, unavailable: true });
      continue;
    }

    const isCorrect = hasAnswer && isAnswerCorrect(question, userAnswer);
    if (isCorrect) correctCount += 1;

    detailedFeedback.push({
      questionId: question._id,
      questionText: question.question,
      type: question.type,
      userAnswer,
      isCorrect,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    });
  }

  const totalQuestions = sessionQuestionIds.length;
  const incorrectCount = totalQuestions - correctCount;
  const scorePercentage = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return { totalQuestions, correctCount, incorrectCount, scorePercentage, detailedFeedback };
};
