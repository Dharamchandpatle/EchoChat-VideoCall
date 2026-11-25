import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeAnswers, isAnswerCorrect } from "../lib/learningGrading.js";

const q = (id, extra = {}) => ({ _id: id, question: `Q${id}`, type: "fill_blank", correctAnswer: "answer", ...extra });

test("all correct answers give 100% and session-sized denominator", () => {
  const qs = [q("a", { correctAnswer: "x" }), q("b", { correctAnswer: "y" })];
  const r = gradeAnswers({
    sessionQuestionIds: ["a", "b"],
    questions: qs,
    answers: [{ questionId: "a", userAnswer: "x" }, { questionId: "b", userAnswer: "y" }],
  });
  assert.equal(r.scorePercentage, 100);
  assert.equal(r.totalQuestions, 2);
});

test("a single correct answer does NOT score 100% when the session has more questions", () => {
  const ids = ["a", "b", "c", "d"];
  const qs = ids.map((id) => q(id, { correctAnswer: "x" }));
  const r = gradeAnswers({ sessionQuestionIds: ids, questions: qs, answers: [{ questionId: "a", userAnswer: "x" }] });
  assert.equal(r.totalQuestions, 4);
  assert.equal(r.correctCount, 1);
  assert.equal(r.scorePercentage, 25);
});

test("unanswered session questions count as incorrect", () => {
  const ids = ["a", "b"];
  const qs = [q("a", { correctAnswer: "x" }), q("b", { correctAnswer: "y" })];
  const r = gradeAnswers({ sessionQuestionIds: ids, questions: qs, answers: [{ questionId: "a", userAnswer: "x" }] });
  assert.equal(r.incorrectCount, 1);
  assert.equal(r.scorePercentage, 50);
});

test("answers for questions outside the session are rejected", () => {
  const r = gradeAnswers({
    sessionQuestionIds: ["a"],
    questions: [q("a")],
    answers: [{ questionId: "zzz", userAnswer: "x" }],
  });
  assert.match(r.error, /not part of this quiz/);
});

test("duplicate answers for one question are rejected", () => {
  const r = gradeAnswers({
    sessionQuestionIds: ["a", "b"],
    questions: [q("a"), q("b")],
    answers: [{ questionId: "a", userAnswer: "answer" }, { questionId: "a", userAnswer: "answer" }],
  });
  assert.match(r.error, /Duplicate/);
});

test("empty, non-array and oversized answer arrays are rejected", () => {
  assert.ok(gradeAnswers({ sessionQuestionIds: ["a"], questions: [q("a")], answers: [] }).error);
  assert.ok(gradeAnswers({ sessionQuestionIds: ["a"], questions: [q("a")], answers: "nope" }).error);
  const r = gradeAnswers({
    sessionQuestionIds: ["a"],
    questions: [q("a")],
    answers: [{ questionId: "a", userAnswer: "x" }, { questionId: "a", userAnswer: "y" }],
  });
  assert.ok(r.error);
});

test("a question removed after being served counts as incorrect, not a crash", () => {
  const r = gradeAnswers({
    sessionQuestionIds: ["a", "gone"],
    questions: [q("a", { correctAnswer: "x" })],
    answers: [{ questionId: "a", userAnswer: "x" }],
  });
  assert.equal(r.correctCount, 1);
  assert.equal(r.totalQuestions, 2);
  assert.equal(r.detailedFeedback[1].unavailable, true);
});

test("string answers are case and whitespace insensitive; object answers never match text", () => {
  assert.equal(isAnswerCorrect(q("a", { correctAnswer: "Namaste" }), "  namaste "), true);
  assert.equal(isAnswerCorrect(q("a", { correctAnswer: "x" }), { not: "a string" }), false);
  assert.equal(isAnswerCorrect(q("a", { correctAnswer: "" }), ""), false, "empty answer never matches empty key");
  assert.equal(isAnswerCorrect(q("a", { correctAnswer: "x" }), undefined), false);
});

test("arrange_words requires exact word order (normalized)", () => {
  const question = q("a", { type: "arrange_words", correctOrder: ["main", "ghar", "jaata", "hoon"] });
  assert.equal(isAnswerCorrect(question, ["main", "ghar", "jaata", "hoon"]), true);
  assert.equal(isAnswerCorrect(question, ["ghar", "main", "jaata", "hoon"]), false);
  assert.equal(isAnswerCorrect(question, ["main", "ghar"]), false);
  assert.equal(isAnswerCorrect(question, "main ghar"), false);
});

test("match requires every pair to match", () => {
  const question = q("a", { type: "match", correctAnswer: { "नमस्ते": "नमस्कार", "पानी": "पाणी" } });
  assert.equal(isAnswerCorrect(question, { "नमस्ते": "नमस्कार", "पानी": "पाणी" }), true);
  assert.equal(isAnswerCorrect(question, { "नमस्ते": "नमस्कार" }), false);
  assert.equal(isAnswerCorrect(question, ["नमस्कार"]), false);
});
