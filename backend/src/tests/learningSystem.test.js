import assert from "node:assert";
import {
  applyStreakUpdate,
  calculateStarsForScore,
} from "../controllers/learning.controller.js";
import { CATEGORIES_DATA, LANGUAGES_DATA } from "../lib/learningSeedData.js";
import { HINDI_MARATHI_LESSONS } from "../lib/hindiMarathiLessons.js";
import {
  EASY_ASSESSMENT_QUESTIONS,
  HARD_ASSESSMENT_QUESTIONS,
  MEDIUM_ASSESSMENT_QUESTIONS,
  PRACTICE_QUIZ_QUESTIONS,
} from "../lib/hindiMarathiQuestions.js";

console.log("=== RUNNING LEARNING SYSTEM VERIFICATION TESTS ===");

// TEST 1: 21 Indian Languages
console.log("Test 1: Verifying 21 Indian Languages configuration...");
assert.strictEqual(LANGUAGES_DATA.length, 21, "Must contain exactly 21 Indian languages");
const expectedLangs = [
  "hi", "en", "mr", "gu", "bn", "ta", "te", "kn", "ml", "pa",
  "or", "as", "ur", "sa", "ks", "kok", "mni", "brx", "doi", "sat", "sd"
];
expectedLangs.forEach((code) => {
  const found = LANGUAGES_DATA.find((l) => l.code === code);
  assert.ok(found, `Language code ${code} must be present`);
  assert.ok(found.nativeName, `Language ${code} must have a nativeName`);
  assert.ok(found.script, `Language ${code} must have a script`);
});
console.log("✔ Test 1 Passed: All 21 Indian languages configured with native scripts.");

// TEST 2: 15 Learning Categories
console.log("Test 2: Verifying 15 Practical Learning Topics...");
assert.strictEqual(CATEGORIES_DATA.length, 15, "Must contain exactly 15 learning categories");
const expectedCategories = [
  "basic-greetings",
  "introduction",
  "numbers-counting",
  "days-months",
  "family-relationships",
  "colors-objects",
  "common-daily-words",
  "food-drinks",
  "everyday-conversations",
  "travel-transportation",
  "shopping",
  "education",
  "workplace-communication",
  "grammar-sentence-formation",
  "reading-writing",
];
expectedCategories.forEach((slug) => {
  const found = CATEGORIES_DATA.find((c) => c.slug === slug);
  assert.ok(found, `Category ${slug} must be present`);
  assert.ok(["easy", "medium", "hard"].includes(found.level), `Category ${slug} must have valid level`);
});
console.log("✔ Test 2 Passed: All 15 practical categories defined across Easy, Medium, and Hard.");

// TEST 3: Star Rewards Table (Requirement 7)
console.log("Test 3: Verifying Star Reward Calculations...");
assert.strictEqual(calculateStarsForScore(100), 5, "100% must yield 5 stars");
assert.strictEqual(calculateStarsForScore(95), 5, "95% must yield 5 stars");
assert.strictEqual(calculateStarsForScore(94), 3, "94% must yield 3 stars");
assert.strictEqual(calculateStarsForScore(80), 3, "80% must yield 3 stars");
assert.strictEqual(calculateStarsForScore(79), 2, "79% must yield 2 stars");
assert.strictEqual(calculateStarsForScore(60), 2, "60% must yield 2 stars");
assert.strictEqual(calculateStarsForScore(59), 1, "59% must yield 1 star");
assert.strictEqual(calculateStarsForScore(40), 1, "40% must yield 1 star");
assert.strictEqual(calculateStarsForScore(39), 0, "39% must yield 0 stars");
assert.strictEqual(calculateStarsForScore(0), 0, "0% must yield 0 stars");
console.log("✔ Test 3 Passed: Star reward distribution conforms strictly to requirements.");

// TEST 4: Daily Learning Streak Logic
console.log("Test 4: Verifying Daily Learning Streak logic...");
const progressObj = {
  streak: { current: 0, longest: 0, lastActiveDate: null },
  lastLearnedAt: null,
};
applyStreakUpdate(progressObj);
assert.strictEqual(progressObj.streak.current, 1, "First activity should start streak at 1");
assert.strictEqual(progressObj.streak.longest, 1, "Longest streak should be 1");

// Same day activity should maintain streak
applyStreakUpdate(progressObj);
assert.strictEqual(progressObj.streak.current, 1, "Same day activity should keep streak at 1");

// Consecutive day
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
progressObj.streak.lastActiveDate = yesterday;
applyStreakUpdate(progressObj);
assert.strictEqual(progressObj.streak.current, 2, "Consecutive day activity should increment streak to 2");
assert.strictEqual(progressObj.streak.longest, 2, "Longest streak should update to 2");

// Missed day
const threeDaysAgo = new Date();
threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
progressObj.streak.lastActiveDate = threeDaysAgo;
applyStreakUpdate(progressObj);
assert.strictEqual(progressObj.streak.current, 1, "Missed activity should reset streak to 1");
assert.strictEqual(progressObj.streak.longest, 2, "Longest streak must be preserved");
console.log("✔ Test 4 Passed: Streak tracking and resilience verified.");

// TEST 5: Level Assessments Question Counts (Requirement 6)
console.log("Test 5: Verifying Level Assessments Question Counts...");
assert.strictEqual(
  EASY_ASSESSMENT_QUESTIONS.length,
  10,
  "Level 1 Easy Assessment must contain exactly 10 questions"
);
assert.strictEqual(
  MEDIUM_ASSESSMENT_QUESTIONS.length,
  15,
  "Level 2 Medium Assessment must contain exactly 15 questions"
);
assert.strictEqual(
  HARD_ASSESSMENT_QUESTIONS.length,
  20,
  "Level 3 Hard Assessment must contain exactly 20 questions"
);
console.log("✔ Test 5 Passed: Easy (10 Qs), Medium (15 Qs), Hard (20 Qs) question counts verified.");

// TEST 6: All 7 Question Types Present
console.log("Test 6: Verifying all 7 question types are implemented...");
const allQuestions = [
  ...PRACTICE_QUIZ_QUESTIONS,
  ...EASY_ASSESSMENT_QUESTIONS,
  ...MEDIUM_ASSESSMENT_QUESTIONS,
  ...HARD_ASSESSMENT_QUESTIONS,
];
const questionTypes = new Set(allQuestions.map((q) => q.type));
const requiredTypes = [
  "mcq",
  "match",
  "translate",
  "fill_blank",
  "correct_sentence",
  "listen_identify",
  "arrange_words",
];
requiredTypes.forEach((t) => {
  assert.ok(questionTypes.has(t), `Question type '${t}' must be represented in questions pool`);
});
console.log("✔ Test 6 Passed: All 7 interactive question types represented.");

// TEST 7: Hindi to Marathi Content Accuracy (Requirement 13)
console.log("Test 7: Verifying Hindi to Marathi vocabulary & translations...");
const greetingsLesson = HINDI_MARATHI_LESSONS.find((l) => l.categorySlug === "basic-greetings");
assert.ok(greetingsLesson, "Basic greetings lesson must exist");
const sampleVocab = greetingsLesson.vocabulary;
const namaskar = sampleVocab.find((v) => v.sourceText === "नमस्ते");
assert.ok(namaskar, "Namaste must be in vocabulary");
assert.strictEqual(namaskar.targetText, "नमस्कार", "Namaste translates to Namaskar");
assert.strictEqual(namaskar.romanized, "Namaskar", "Romanized should be Namaskar");

const introLesson = HINDI_MARATHI_LESSONS.find((l) => l.categorySlug === "introduction");
assert.ok(introLesson, "Introduction lesson must exist");
const dharamchand = introLesson.vocabulary.find((v) => v.sourceText.includes("धर्मचंद"));
assert.ok(dharamchand, "Sample sentence with Dharamchand must exist");
assert.ok(dharamchand.targetText.includes("माझे नाव धर्मचंद आहे"), "Target sentence must match Marathi");
console.log("✔ Test 7 Passed: Accurate Hindi -> Marathi sample content validated.");

console.log("\nALL 7 SYSTEM VERIFICATION TESTS PASSED SUCCESSFULLY! 🎯\n");
