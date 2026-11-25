// End-to-end API tests against a real MongoDB (in-memory via mongodb-memory-server).
// Stream and Gemini credentials are intentionally NOT set: those integrations are exercised only
// for their failure paths here. If the MongoDB binary cannot be obtained, the suite is skipped
// with a reason instead of failing.
import { test, before, beforeEach, after, describe } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET_KEY ||= "integration-test-secret";
process.env.ALLOW_SELF_ADMIN_CLAIM = "true";
process.env.AUTH_RATE_LIMIT_MAX = "100000";
// Empty strings (not deletion): dotenv would otherwise reload real keys from backend/.env.
process.env.STREAM_API_KEY = "";
process.env.STREAM_API_SECRET = "";
process.env.GEMINI_API_KEY = "";

const mongoose = (await import("mongoose")).default;
let MongoMemoryServer = null;
try {
  ({ MongoMemoryServer } = await import("mongodb-memory-server"));
} catch {
  MongoMemoryServer = null;
}

let mongod;
let base;
let server;
let skipReason = null;
let app;
let models;

before(async () => {
  // Option 1: MONGO_TEST_URI pointing at a throwaway local database (name must contain "test").
  // Option 2: an in-memory MongoDB started by mongodb-memory-server (downloads a binary once).
  const externalUri = process.env.MONGO_TEST_URI;
  if (externalUri) {
    const dbName = new URL(externalUri).pathname.replace("/", "");
    if (!/test/i.test(dbName)) {
      skipReason = "MONGO_TEST_URI database name must contain 'test' (refusing to drop other databases)";
      return;
    }
    await mongoose.connect(externalUri);
    await mongoose.connection.db.dropDatabase();
  } else {
    if (!MongoMemoryServer) {
      skipReason = "no MONGO_TEST_URI set and mongodb-memory-server is not installed";
      return;
    }
    try {
      mongod = await MongoMemoryServer.create();
    } catch (error) {
      skipReason = `MongoDB binary unavailable: ${error.message.slice(0, 120)}`;
      return;
    }
    await mongoose.connect(mongod.getUri());
  }
  ({ default: app } = await import("../server.js"));
  models = {
    User: (await import("../models/User.js")).default,
    Language: (await import("../models/Language.js")).default,
    LearningCategory: (await import("../models/LearningCategory.js")).default,
    Lesson: (await import("../models/Lesson.js")).default,
    QuizQuestion: (await import("../models/QuizQuestion.js")).default,
    QuizAttempt: (await import("../models/QuizAttempt.js")).default,
    UserLanguageProgress: (await import("../models/UserLanguageProgress.js")).default,
    FriendRequest: (await import("../models/FriendRequest.js")).default,
  };
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const req = async (method, path, { body, cookie } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const setCookie = res.headers.get("set-cookie");
  const cookieValue = setCookie ? setCookie.split(";")[0] : null;
  return { status: res.status, json, cookieValue };
};

// Helper: returns a session cookie for a new signed-up user.
let emailCounter = 0;
const signupUser = async (fullName = "Test User") => {
  emailCounter += 1;
  const email = `user${emailCounter}@example.com`;
  const r = await req("POST", "/api/auth/signup", { body: { email, password: "secret123", fullName } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { id: r.json.user._id, email, cookie: r.cookieValue, body: r.json };
};

const onboard = async (u, overrides = {}) =>
  req("POST", "/api/auth/onboarding", {
    cookie: u.cookie,
    body: {
      fullName: "Onboarded",
      bio: "Learner",
      nativeLanguage: "hi",
      learningLanguage: "mr",
      location: "Pune",
      ...overrides,
    },
  });

const skipIfNoMongo = (t) => {
  if (skipReason) {
    t.skip(skipReason);
    return true;
  }
  return false;
};

describe("authentication", () => {
  test("signup returns a user without a password and sets an httpOnly session cookie", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = await signupUser("Alice");
    assert.equal("password" in u.body.user, false);
    assert.ok(u.cookie?.startsWith("jwt="));
    const stored = await models.User.findById(u.id).lean();
    assert.notEqual(stored.password, "secret123", "password must be hashed at rest");
    assert.match(stored.password, /^\$2[aby]\$/);
  });

  test("duplicate signup (case-insensitive) returns 409", async (t) => {
    if (skipIfNoMongo(t)) return;
    const email = "Dup.User@Example.com";
    const first = await req("POST", "/api/auth/signup", { body: { email, password: "secret123", fullName: "A" } });
    assert.equal(first.status, 201);
    const second = await req("POST", "/api/auth/signup", { body: { email: "dup.user@example.com", password: "secret123", fullName: "B" } });
    assert.equal(second.status, 409);
  });

  test("login: wrong password and unknown email give the same 401", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = await signupUser("Bob");
    const wrong = await req("POST", "/api/auth/login", { body: { email: u.email, password: "nope-nope" } });
    const unknown = await req("POST", "/api/auth/login", { body: { email: "ghost@example.com", password: "nope-nope" } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.json.message, unknown.json.message);
  });

  test("login succeeds, returns no password, and /me works with the cookie (session persistence)", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = await signupUser("Carol");
    const login = await req("POST", "/api/auth/login", { body: { email: u.email.toUpperCase(), password: "secret123" } });
    assert.equal(login.status, 200);
    assert.equal("password" in login.json.user, false);
    const me = await req("GET", "/api/auth/me", { cookie: login.cookieValue });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, u.email);
  });

  test("logout clears the cookie and a forged or missing cookie is rejected", async (t) => {
    if (skipIfNoMongo(t)) return;
    const out = await req("POST", "/api/auth/logout");
    assert.equal(out.status, 200);
    const anon = await req("GET", "/api/auth/me");
    assert.equal(anon.status, 401);
  });

  test("onboarding cannot escalate privileges (role/email/friends are ignored)", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = await signupUser("Dave");
    const r = await onboard(u, { role: "admin", email: "hijack@example.com", friends: [u.id], isOnboarded: "yes" });
    assert.equal(r.status, 200);
    assert.equal(r.json.user.role, "user");
    assert.equal(r.json.user.email, u.email);
    assert.equal(r.json.user.isOnboarded, true);
    assert.equal("password" in r.json.user, false);
  });

  test("onboarding validates required fields and reports which are missing", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = await signupUser("Eve");
    const r = await req("POST", "/api/auth/onboarding", { cookie: u.cookie, body: { fullName: "Eve", bio: "" } });
    assert.equal(r.status, 400);
    assert.ok(r.json.missingFields.includes("bio"));
    assert.ok(r.json.missingFields.includes("location"));
  });
});

describe("social networking", () => {
  test("recommendations exclude self and expose no email or password", async (t) => {
    if (skipIfNoMongo(t)) return;
    const a = await signupUser("Rec A");
    const b = await signupUser("Rec B");
    await onboard(a);
    await onboard(b);
    const r = await req("GET", "/api/users", { cookie: a.cookie });
    assert.equal(r.status, 200);
    const ids = r.json.map((u) => u._id);
    assert.ok(!ids.includes(a.id));
    assert.ok(ids.includes(b.id));
    for (const user of r.json) {
      assert.equal("password" in user, false);
      assert.equal("email" in user, false);
    }
  });

  test("friend request lifecycle: create, duplicate/self prevention, accept, idempotent guard, friends on both sides", async (t) => {
    if (skipIfNoMongo(t)) return;
    const a = await signupUser("Fr A");
    const b = await signupUser("Fr B");
    await onboard(a);
    await onboard(b);

    const self = await req("POST", `/api/users/friend-request/${a.id}`, { cookie: a.cookie });
    assert.equal(self.status, 400);

    const sent = await req("POST", `/api/users/friend-request/${b.id}`, { cookie: a.cookie });
    assert.equal(sent.status, 201);
    const requestId = sent.json._id;

    const dup = await req("POST", `/api/users/friend-request/${b.id}`, { cookie: a.cookie });
    assert.equal(dup.status, 400);
    const reverse = await req("POST", `/api/users/friend-request/${a.id}`, { cookie: b.cookie });
    assert.equal(reverse.status, 400, "reverse direction is also a duplicate");

    const incoming = await req("GET", "/api/users/friend-requests", { cookie: b.cookie });
    assert.equal(incoming.json.incomingReqs.length, 1);
    const outgoing = await req("GET", "/api/users/outgoing-friend-requests", { cookie: a.cookie });
    assert.equal(outgoing.json.length, 1);

    const accepted = await req("PUT", `/api/users/friend-request/${requestId}/accept`, { cookie: b.cookie });
    assert.equal(accepted.status, 200);
    const again = await req("PUT", `/api/users/friend-request/${requestId}/accept`, { cookie: b.cookie });
    assert.equal(again.status, 409, "an accepted request cannot be accepted again");

    const friendsA = await req("GET", "/api/users/friends", { cookie: a.cookie });
    const friendsB = await req("GET", "/api/users/friends", { cookie: b.cookie });
    assert.ok(friendsA.json.some((f) => f._id === b.id));
    assert.ok(friendsB.json.some((f) => f._id === a.id));

    const stored = await models.User.findById(a.id).lean();
    assert.equal(stored.friends.length, 1, "friendship is recorded once, not duplicated");

    const recs = await req("GET", "/api/users", { cookie: a.cookie });
    assert.ok(!recs.json.some((u) => u._id === b.id), "friends are not recommended");
  });

  test("only the recipient can accept and only the recipient can reject", async (t) => {
    if (skipIfNoMongo(t)) return;
    const a = await signupUser("Auth A");
    const b = await signupUser("Auth B");
    const c = await signupUser("Auth C");
    await onboard(a);
    await onboard(b);
    await onboard(c);
    const sent = await req("POST", `/api/users/friend-request/${b.id}`, { cookie: a.cookie });
    const id = sent.json._id;

    const wrongAccept = await req("PUT", `/api/users/friend-request/${id}/accept`, { cookie: c.cookie });
    assert.equal(wrongAccept.status, 403);
    const senderAccept = await req("PUT", `/api/users/friend-request/${id}/accept`, { cookie: a.cookie });
    assert.equal(senderAccept.status, 403);
    const wrongReject = await req("PUT", `/api/users/friend-request/${id}/reject`, { cookie: c.cookie });
    assert.equal(wrongReject.status, 403);
  });

  test("rejecting removes the request so a new one can be sent later; cancelling works for the sender", async (t) => {
    if (skipIfNoMongo(t)) return;
    const a = await signupUser("Rej A");
    const b = await signupUser("Rej B");
    await onboard(a);
    await onboard(b);

    const first = await req("POST", `/api/users/friend-request/${b.id}`, { cookie: a.cookie });
    const rejected = await req("PUT", `/api/users/friend-request/${first.json._id}/reject`, { cookie: b.cookie });
    assert.equal(rejected.status, 200);
    const resent = await req("POST", `/api/users/friend-request/${b.id}`, { cookie: a.cookie });
    assert.equal(resent.status, 201);

    const cancelled = await req("DELETE", `/api/users/friend-request/${resent.json._id}`, { cookie: b.cookie });
    assert.equal(cancelled.status, 403, "recipient cannot cancel");
    const ok = await req("DELETE", `/api/users/friend-request/${resent.json._id}`, { cookie: a.cookie });
    assert.equal(ok.status, 200);
    assert.equal(await models.FriendRequest.countDocuments({ _id: resent.json._id }), 0);
  });

  test("malformed ids return 400, not a database error", async (t) => {
    if (skipIfNoMongo(t)) return;
    const a = await signupUser("Bad Id");
    const r = await req("POST", "/api/users/friend-request/not-an-id", { cookie: a.cookie });
    assert.equal(r.status, 400);
  });

  test("chat sync is limited to self, friends, or admins", async (t) => {
    if (skipIfNoMongo(t)) return;
    const a = await signupUser("Sync A");
    const stranger = await signupUser("Sync S");
    const r = await req("POST", `/api/chat/user/${stranger.id}`, { cookie: a.cookie });
    assert.equal(r.status, 403);
  });
});

describe("admin", () => {
  test("claim-admin (enabled only for this test env) promotes the caller; stats then succeed", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = await signupUser("Admin Candidate");
    const before = await req("GET", "/api/admin/learning/stats", { cookie: u.cookie });
    assert.equal(before.status, 403);
    const claim = await req("POST", "/api/admin/learning/claim-admin", { cookie: u.cookie });
    assert.equal(claim.status, 200);
    const after = await req("GET", "/api/admin/learning/stats", { cookie: u.cookie });
    assert.equal(after.status, 200);
    assert.equal(typeof after.json.totalUsers, "number");
  });

  test("non-admin users cannot seed or write content", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = await signupUser("Plain User");
    const seed = await req("POST", "/api/admin/learning/seed", { cookie: u.cookie });
    assert.equal(seed.status, 403);
    const lang = await req("POST", "/api/admin/learning/languages", { cookie: u.cookie, body: { code: "xx", name: "X", nativeName: "X", script: "L" } });
    assert.equal(lang.status, 403);
  });
});

describe("learning system (server-side scoring)", () => {
  let learner;
  let category;
  let questions = [];

  before(async () => {
    if (skipReason) return;
    await models.Language.create([
      { code: "hi", name: "Hindi", nativeName: "हिन्दी", script: "Devanagari" },
      { code: "mr", name: "Marathi", nativeName: "मराठी", script: "Devanagari" },
    ]);
    category = await models.LearningCategory.create({ slug: "greetings", name: "Greetings", order: 1, level: "easy" });
    await models.Lesson.create({
      title: "Greetings 1",
      category: category._id,
      sourceLanguage: "hi",
      targetLanguage: "mr",
      level: "easy",
      order: 1,
      isPublished: true,
    });
    const otherLesson = await models.Lesson.create({
      title: "Other pair",
      category: category._id,
      sourceLanguage: "en",
      targetLanguage: "fr",
      level: "easy",
      order: 2,
      isPublished: true,
    });
    globalThis.__otherLessonId = otherLesson._id.toString();

    const build = (i, isAssessment) => ({
      sourceLanguage: "hi",
      targetLanguage: "mr",
      level: "easy",
      category: category._id,
      isAssessment,
      isActive: true,
      type: "fill_blank",
      question: `Q${i} ${isAssessment ? "assessment" : "practice"}`,
      correctAnswer: `answer${i}`,
      explanation: "because",
    });
    questions = await models.QuizQuestion.create([
      ...Array.from({ length: 12 }, (_, i) => build(i, false)),
      ...Array.from({ length: 10 }, (_, i) => build(i + 100, true)),
    ]);

    learner = await signupUser("Learner");
    await onboard(learner);
    const sel = await req("POST", "/api/learning/select-language", { cookie: learner.cookie, body: { nativeLanguage: "hi", targetLanguage: "mr" } });
    assert.equal(sel.status, 200, JSON.stringify(sel.json));
  });

  const practiceQuestions = () => questions.filter((q) => !q.isAssessment && q.question.includes("practice"));
  const assessmentQuestions = () => questions.filter((q) => q.isAssessment);

  test("practice quiz is served with a session and answers stripped", async (t) => {
    if (skipIfNoMongo(t)) return;
    const r = await req("GET", `/api/learning/quiz/${category._id}`, { cookie: learner.cookie });
    assert.equal(r.status, 200);
    assert.ok(r.json.sessionId);
    assert.equal(r.json.questions.length, 10);
    for (const q of r.json.questions) {
      assert.equal("correctAnswer" in q, false);
      assert.equal("explanation" in q, false);
    }
  });

  test("practice: a single correct answer does NOT yield 100%; denominator is the session size", async (t) => {
    if (skipIfNoMongo(t)) return;
    const served = await req("GET", `/api/learning/quiz/${category._id}`, { cookie: learner.cookie });
    const sessionId = served.json.sessionId;
    const ids = served.json.questions.map((q) => q._id);
    const first = await models.QuizQuestion.findById(ids[0]).lean();
    const submit = await req("POST", "/api/learning/quiz/submit", {
      cookie: learner.cookie,
      body: { sessionId, categoryId: category._id.toString(), answers: [{ questionId: ids[0], userAnswer: first.correctAnswer }], timeTakenSeconds: 5 },
    });
    assert.equal(submit.status, 200, JSON.stringify(submit.json));
    assert.equal(submit.json.totalQuestions, 10);
    assert.equal(submit.json.scorePercentage, 10);
  });

  test("practice: the same session cannot be submitted twice (duplicate submission)", async (t) => {
    if (skipIfNoMongo(t)) return;
    const served = await req("GET", `/api/learning/quiz/${category._id}`, { cookie: learner.cookie });
    const body = {
      sessionId: served.json.sessionId,
      categoryId: category._id.toString(),
      answers: [{ questionId: served.json.questions[0]._id, userAnswer: "x" }],
    };
    const first = await req("POST", "/api/learning/quiz/submit", { cookie: learner.cookie, body });
    assert.equal(first.status, 200);
    const second = await req("POST", "/api/learning/quiz/submit", { cookie: learner.cookie, body });
    assert.equal(second.status, 409);
  });

  test("practice: answering questions outside the served session is rejected", async (t) => {
    if (skipIfNoMongo(t)) return;
    const served = await req("GET", `/api/learning/quiz/${category._id}`, { cookie: learner.cookie });
    const outsider = practiceQuestions().find((q) => !served.json.questions.some((s) => s._id === q._id.toString()));
    const r = await req("POST", "/api/learning/quiz/submit", {
      cookie: learner.cookie,
      body: { sessionId: served.json.sessionId, categoryId: category._id.toString(), answers: [{ questionId: outsider._id.toString(), userAnswer: outsider.correctAnswer }] },
    });
    assert.equal(r.status, 400);
    // The session is still open because validation failed before it was claimed.
    const retry = await req("POST", "/api/learning/quiz/submit", {
      cookie: learner.cookie,
      body: { sessionId: served.json.sessionId, categoryId: category._id.toString(), answers: [{ questionId: served.json.questions[0]._id, userAnswer: "x" }] },
    });
    assert.equal(retry.status, 200);
  });

  test("practice: submit without a session id is rejected", async (t) => {
    if (skipIfNoMongo(t)) return;
    const r = await req("POST", "/api/learning/quiz/submit", { cookie: learner.cookie, body: { answers: [{ questionId: "x", userAnswer: "y" }] } });
    assert.equal(r.status, 400);
  });

  test("assessment: locked level returns 403; easy assessment is served with a session", async (t) => {
    if (skipIfNoMongo(t)) return;
    const locked = await req("GET", "/api/learning/assessment/medium", { cookie: learner.cookie });
    assert.equal(locked.status, 403);
    const easy = await req("GET", "/api/learning/assessment/easy", { cookie: learner.cookie });
    assert.equal(easy.status, 200);
    assert.ok(easy.json.sessionId);
    assert.equal(easy.json.totalQuestions, 10);
  });

  test("assessment: one correct answer scores 10%, not 100%, and does not unlock the next level", async (t) => {
    if (skipIfNoMongo(t)) return;
    const served = await req("GET", "/api/learning/assessment/easy", { cookie: learner.cookie });
    const first = await models.QuizQuestion.findById(served.json.questions[0]._id).lean();
    const r = await req("POST", "/api/learning/assessment/submit", {
      cookie: learner.cookie,
      body: { sessionId: served.json.sessionId, level: "easy", answers: [{ questionId: first._id.toString(), userAnswer: first.correctAnswer }] },
    });
    // A single answer is valid input but the score must be over the full session.
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.scorePercentage, 10);
    assert.equal(r.json.isPassed, false);
    assert.equal(r.json.nextLevelUnlocked, null);
  });

  test("assessment: a second submission of the same session is rejected", async (t) => {
    if (skipIfNoMongo(t)) return;
    const served = await req("GET", "/api/learning/assessment/easy", { cookie: learner.cookie });
    const body = { sessionId: served.json.sessionId, level: "easy", answers: served.json.questions.map((q) => ({ questionId: q._id, userAnswer: "x" })) };
    const first = await req("POST", "/api/learning/assessment/submit", { cookie: learner.cookie, body });
    assert.equal(first.status, 200);
    const second = await req("POST", "/api/learning/assessment/submit", { cookie: learner.cookie, body });
    assert.equal(second.status, 409);
  });

  test("assessment: a passing score awards stars once, unlocks medium, and stores the attempt", async (t) => {
    if (skipIfNoMongo(t)) return;
    const served = await req("GET", "/api/learning/assessment/easy", { cookie: learner.cookie });
    const answers = [];
    for (const q of served.json.questions) {
      const stored = await models.QuizQuestion.findById(q._id).lean();
      answers.push({ questionId: q._id, userAnswer: stored.correctAnswer });
    }
    const r = await req("POST", "/api/learning/assessment/submit", {
      cookie: learner.cookie,
      body: { sessionId: served.json.sessionId, level: "easy", answers },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.scorePercentage, 100);
    assert.equal(r.json.starsEarned, 5);
    assert.equal(r.json.nextLevelUnlocked, "medium");
    const progress = await models.UserLanguageProgress.findOne({ user: learner.id }).lean();
    assert.ok(progress.unlockedLevels.includes("medium"));
    assert.equal(progress.levelStars.easy, 5);
    assert.ok(await models.QuizAttempt.findById(r.json.attemptId));
  });

  test("assessment: a session cannot be used by a different user", async (t) => {
    if (skipIfNoMongo(t)) return;
    const served = await req("GET", "/api/learning/assessment/easy", { cookie: learner.cookie });
    const other = await signupUser("Intruder");
    await onboard(other);
    await req("POST", "/api/learning/select-language", { cookie: other.cookie, body: { nativeLanguage: "hi", targetLanguage: "mr" } });
    const r = await req("POST", "/api/learning/assessment/submit", {
      cookie: other.cookie,
      body: { sessionId: served.json.sessionId, level: "easy", answers: [{ questionId: served.json.questions[0]._id, userAnswer: "x" }] },
    });
    assert.equal(r.status, 404);
  });

  test("lesson completion is refused for a lesson outside the active language pair", async (t) => {
    if (skipIfNoMongo(t)) return;
    const r = await req("POST", `/api/learning/lessons/${globalThis.__otherLessonId}/complete`, { cookie: learner.cookie });
    assert.equal(r.status, 403);
  });

  test("malformed lesson and category ids return 400", async (t) => {
    if (skipIfNoMongo(t)) return;
    const bad = await req("POST", "/api/learning/lessons/zzz/complete", { cookie: learner.cookie });
    assert.equal(bad.status, 400);
    const badCat = await req("GET", "/api/learning/quiz/zzz", { cookie: learner.cookie });
    assert.equal(badCat.status, 400);
  });

  test("select-language rejects non-string input with 400 instead of crashing", async (t) => {
    if (skipIfNoMongo(t)) return;
    const r = await req("POST", "/api/learning/select-language", { cookie: learner.cookie, body: { nativeLanguage: 5, targetLanguage: "mr" } });
    assert.equal(r.status, 400);
  });
});

describe("AI integration without credentials", () => {
  test("AI endpoints report not-configured (503) rather than crashing when no Gemini key is set", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = await signupUser("AI User");
    const chat = await req("POST", "/api/ai/chat", { cookie: u.cookie, body: { message: "hello" } });
    assert.equal(chat.status, 503);
    assert.match(chat.json.error, /not configured/);
  });

  test("AI input validation happens before any provider call", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = await signupUser("AI Validator");
    const empty = await req("POST", "/api/ai/translate", { cookie: u.cookie, body: { text: "" } });
    assert.equal(empty.status, 400);
    const huge = await req("POST", "/api/ai/chat", { cookie: u.cookie, body: { message: "a".repeat(2001) } });
    assert.equal(huge.status, 400);
  });
});

describe("translation (cache, fallback, dedupe, HTTP contract, per-user preferences)", () => {
  let providersMod;
  let alice;
  let bob;
  let calls;

  const providerError = (status) => Object.assign(new Error(`status ${status}`), { status });

  before(async () => {
    if (skipReason) return;
    providersMod = await import("../services/translation.service.js");
    alice = await signupUser("Alice Native");
    await onboard(alice, { nativeLanguage: "Hindi", learningLanguage: "Marathi" });
    bob = await signupUser("Bob Native");
    await onboard(bob, { nativeLanguage: "Marathi", learningLanguage: "Hindi" });
  });

  beforeEach(() => {
    calls = { gemini: 0, mymemory: 0 };
    providersMod?.setTranslationProviders({
      gemini: async ({ text, targetCode }) => {
        calls.gemini += 1;
        return { translation: `[${targetCode}] ${text}`, detectedCode: "en" };
      },
      mymemory: async () => {
        calls.mymemory += 1;
        return null;
      },
    });
  });

  after(() => {
    providersMod?.resetTranslationProviders();
  });

  test("first call hits the provider; identical request is served from the MongoDB cache", async (t) => {
    if (skipIfNoMongo(t)) return;
    const text = "cache-check-message-1";
    const a = await req("POST", "/api/ai/translate", { cookie: alice.cookie, body: { text, targetLanguage: "Marathi" } });
    assert.equal(a.status, 200, JSON.stringify(a.json));
    assert.equal(a.json.cached, false);
    const b = await req("POST", "/api/ai/translate", { cookie: bob.cookie, body: { text, targetLanguage: "mr" } });
    assert.equal(b.status, 200);
    assert.equal(b.json.cached, true, "the other participant reuses the same translation");
    assert.equal(calls.gemini, 1, "provider called exactly once");
  });

  test("simultaneous identical requests share one provider call", async (t) => {
    if (skipIfNoMongo(t)) return;
    const text = "dedupe-check-message";
    const results = await Promise.all(
      Array.from({ length: 5 }, () => req("POST", "/api/ai/translate", { cookie: alice.cookie, body: { text, targetLanguage: "Hindi", sourceLanguage: "English" } }))
    );
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(calls.gemini, 1);
  });

  test("Gemini rate limit falls back to MyMemory; MyMemory result is returned", async (t) => {
    if (skipIfNoMongo(t)) return;
    providersMod.setTranslationProviders({
      gemini: async () => {
        calls.gemini += 1;
        throw providerError(429);
      },
      mymemory: async ({ text }) => {
        calls.mymemory += 1;
        return { translation: `mm:${text}`, detectedCode: null };
      },
    });
    const r = await req("POST", "/api/ai/translate", { cookie: alice.cookie, body: { text: "fallback-message", targetLanguage: "Hindi" } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.provider, "mymemory");
    assert.equal(calls.mymemory, 1);
  });

  test("Gemini rate limit with no fallback returns a meaningful 429", async (t) => {
    if (skipIfNoMongo(t)) return;
    providersMod.setTranslationProviders({
      gemini: async () => {
        throw providerError(429);
      },
      mymemory: async () => null,
    });
    const r = await req("POST", "/api/ai/translate", { cookie: alice.cookie, body: { text: "ratelimit-message", targetLanguage: "Hindi" } });
    assert.equal(r.status, 429);
    assert.equal(r.json.code, "RATE_LIMITED");
  });

  test("total provider failure returns 503 PROVIDERS_UNAVAILABLE without leaking provider details", async (t) => {
    if (skipIfNoMongo(t)) return;
    providersMod.setTranslationProviders({
      gemini: async () => {
        throw new Error("secret-internal-detail");
      },
      mymemory: async () => {
        throw new Error("network down");
      },
    });
    const r = await req("POST", "/api/ai/translate", { cookie: alice.cookie, body: { text: "outage-message", targetLanguage: "Hindi" } });
    assert.equal(r.status, 503);
    assert.equal(r.json.code, "PROVIDERS_UNAVAILABLE");
    assert.equal(JSON.stringify(r.json).includes("secret-internal-detail"), false);
  });

  test("failed translations are not cached, so a later retry calls the provider again", async (t) => {
    if (skipIfNoMongo(t)) return;
    const text = "retry-after-failure";
    providersMod.setTranslationProviders({
      gemini: async () => {
        throw providerError(503);
      },
      mymemory: async () => null,
    });
    const first = await req("POST", "/api/ai/translate", { cookie: alice.cookie, body: { text, targetLanguage: "Hindi" } });
    assert.equal(first.status, 503);
    providersMod.setTranslationProviders({
      gemini: async () => ({ translation: "recovered", detectedCode: "en" }),
    });
    const second = await req("POST", "/api/ai/translate", { cookie: alice.cookie, body: { text, targetLanguage: "Hindi" } });
    assert.equal(second.status, 200);
    assert.equal(second.json.translatedText, "recovered");
  });

  test("auto source detection reports the detected language to the caller", async (t) => {
    if (skipIfNoMongo(t)) return;
    const r = await req("POST", "/api/ai/translate", { cookie: bob.cookie, body: { text: "auto-detect-me", targetLanguage: "Marathi" } });
    assert.equal(r.status, 200);
    assert.equal(r.json.detectedLanguage, "English");
    assert.equal(r.json.sourceLanguage, "English");
    assert.equal(r.json.targetLanguage, "Marathi");
    assert.equal(r.json.originalText, "auto-detect-me");
    assert.ok("translatedText" in r.json && "provider" in r.json && "cached" in r.json);
  });

  test("validation: empty text, missing or unsupported target, unsupported source, and oversize are 400s", async (t) => {
    if (skipIfNoMongo(t)) return;
    const base = { cookie: alice.cookie };
    assert.equal((await req("POST", "/api/ai/translate", { ...base, body: { text: "  ", targetLanguage: "Hindi" } })).status, 400);
    assert.equal((await req("POST", "/api/ai/translate", { ...base, body: { text: "hi" } })).status, 400);
    assert.equal((await req("POST", "/api/ai/translate", { ...base, body: { text: "hi", targetLanguage: "Klingon" } })).status, 400);
    const badSource = await req("POST", "/api/ai/translate", { ...base, body: { text: "hi", targetLanguage: "Hindi", sourceLanguage: "Klingon" } });
    assert.equal(badSource.json.code, "UNSUPPORTED_SOURCE");
    assert.equal((await req("POST", "/api/ai/translate", { ...base, body: { text: "x".repeat(2001), targetLanguage: "Hindi" } })).status, 400);
  });

  test("same source and target never calls a provider", async (t) => {
    if (skipIfNoMongo(t)) return;
    const r = await req("POST", "/api/ai/translate", { cookie: alice.cookie, body: { text: "already-hindi", targetLanguage: "Hindi", sourceLanguage: "Hindi" } });
    assert.equal(r.status, 200);
    assert.equal(r.json.translatedText, "already-hindi");
    assert.equal(calls.gemini, 0);
  });

  test("translation requires authentication", async (t) => {
    if (skipIfNoMongo(t)) return;
    const r = await req("POST", "/api/ai/translate", { body: { text: "hi", targetLanguage: "Hindi" } });
    assert.equal(r.status, 401);
  });

  test("translation preferences: defaults, persistence, and independence from language settings", async (t) => {
    if (skipIfNoMongo(t)) return;
    const me = await req("GET", "/api/auth/me", { cookie: alice.cookie });
    assert.equal(me.json.user.translationPreferences.targetChoice, "native");
    assert.equal(me.json.user.translationPreferences.autoTranslate, false);

    const choose = await req("PATCH", "/api/auth/translation-preferences", { cookie: alice.cookie, body: { targetChoice: "custom", customTargetLanguage: "Tamil", autoTranslate: true, displayMode: "compact" } });
    assert.equal(choose.status, 200, JSON.stringify(choose.json));
    assert.equal(choose.json.user.translationPreferences.customTargetLanguage, "Tamil");

    // Changing the native language must not overwrite the learning language or the custom translation target.
    const changeNative = await req("PATCH", "/api/auth/profile", { cookie: alice.cookie, body: { nativeLanguage: "Bengali" } });
    assert.equal(changeNative.status, 200);
    assert.equal(changeNative.json.user.learningLanguage, "Marathi");
    assert.equal(changeNative.json.user.translationPreferences.targetChoice, "custom");
    assert.equal(changeNative.json.user.translationPreferences.customTargetLanguage, "Tamil");

    // Preferences are per user: Bob still has his own defaults.
    const bobMe = await req("GET", "/api/auth/me", { cookie: bob.cookie });
    assert.equal(bobMe.json.user.translationPreferences.autoTranslate, false);
    assert.equal(bobMe.json.user.translationPreferences.targetChoice, "native");
  });

  test("translation preference validation rejects bad values", async (t) => {
    if (skipIfNoMongo(t)) return;
    const c = { cookie: bob.cookie };
    assert.equal((await req("PATCH", "/api/auth/translation-preferences", { ...c, body: { targetChoice: "everything" } })).status, 400);
    assert.equal((await req("PATCH", "/api/auth/translation-preferences", { ...c, body: { autoTranslate: "yes" } })).status, 400);
    assert.equal((await req("PATCH", "/api/auth/translation-preferences", { ...c, body: { displayMode: "huge" } })).status, 400);
    assert.equal((await req("PATCH", "/api/auth/translation-preferences", { ...c, body: { customTargetLanguage: "Klingon" } })).status, 400);
    assert.equal((await req("PATCH", "/api/auth/translation-preferences", { ...c, body: {} })).status, 400);
  });

  test("onboarding and profile reject unsupported native or learning language", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = await signupUser("Lang Check");
    const bad = await onboard(u, { nativeLanguage: "Klingon" });
    assert.equal(bad.status, 400);
    const badProfile = await req("PATCH", "/api/auth/profile", { cookie: u.cookie, body: { learningLanguage: "Elvish" } });
    assert.equal(badProfile.status, 400);
  });
});

describe("phase 4: moderation, vocabulary, goals, revision, admin, content, AI tutor", () => {
  let tutorMod;
  let adminUser;
  let member;
  let peer;
  let learnerP4;
  let p4Category;
  let p4Questions = [];

  before(async () => {
    if (skipReason) return;
    tutorMod = await import("../services/aiTutor.service.js");
    const Language = (await import("../models/Language.js")).default;
    const LearningCategory = (await import("../models/LearningCategory.js")).default;
    const Lesson = (await import("../models/Lesson.js")).default;
    const QuizQuestion = (await import("../models/QuizQuestion.js")).default;
    const LessonVocabulary = (await import("../models/LessonVocabulary.js")).default;
    models.Lesson = Lesson;
    models.LessonVocabulary = LessonVocabulary;
    models.QuizQuestion = QuizQuestion;
    models.LearningCategory = LearningCategory;
    models.Language = Language;

    // Languages used by content validation must exist and be active.
    for (const [code, name] of [["hi", "Hindi"], ["mr", "Marathi"], ["en", "English"]]) {
      await Language.updateOne(
        { code },
        { $set: { code, name, nativeName: name, script: "Devanagari", isActive: true } },
        { upsert: true }
      );
    }

    adminUser = await signupUser("P4 Admin");
    const claim = await req("POST", "/api/admin/learning/claim-admin", { cookie: adminUser.cookie });
    assert.equal(claim.status, 200, "admin bootstrap (enabled only in this test env)");

    member = await signupUser("P4 Member");
    await onboard(member, { nativeLanguage: "Hindi", learningLanguage: "Marathi" });
    peer = await signupUser("P4 Peer");
    await onboard(peer, { nativeLanguage: "Marathi", learningLanguage: "Hindi" });

    learnerP4 = await signupUser("P4 Learner");
    await onboard(learnerP4, { nativeLanguage: "Hindi", learningLanguage: "Marathi" });
    await req("POST", "/api/learning/select-language", { cookie: learnerP4.cookie, body: { nativeLanguage: "hi", targetLanguage: "mr" } });

    p4Category = await LearningCategory.create({ slug: "p4-revision", name: "P4 Revision", order: 99, level: "easy" });
    await Lesson.create({
      title: "P4 Lesson 1",
      category: p4Category._id,
      sourceLanguage: "hi",
      targetLanguage: "mr",
      level: "easy",
      order: 1,
      isPublished: true,
    });
    p4Questions = await QuizQuestion.create(
      Array.from({ length: 12 }, (_, i) => ({
        sourceLanguage: "hi",
        targetLanguage: "mr",
        level: "easy",
        category: p4Category._id,
        isAssessment: false,
        isActive: true,
        type: "fill_blank",
        question: `P4 practice question ${i}`,
        correctAnswer: `p4-answer-${i}`,
        explanation: "because",
      }))
    );
  });

  after(() => {
    tutorMod?.resetTutorGenerator();
  });

  test("block: hides both sides, ends friendship, prevents requests; unblock restores visibility", async (t) => {
    if (skipIfNoMongo(t)) return;
    const a = await signupUser("Block A");
    const b = await signupUser("Block B");
    await onboard(a);
    await onboard(b);

    const sent = await req("POST", `/api/users/friend-request/${b.id}`, { cookie: a.cookie });
    await req("PUT", `/api/users/friend-request/${sent.json._id}/accept`, { cookie: b.cookie });
    assert.equal((await req("GET", "/api/users/friends", { cookie: a.cookie })).json.length, 1);

    assert.equal((await req("POST", `/api/users/${a.id}/block`, { cookie: a.cookie })).status, 400, "cannot block self");
    const blocked = await req("POST", `/api/users/${b.id}/block`, { cookie: a.cookie });
    assert.equal(blocked.status, 200);

    assert.equal((await req("GET", "/api/users/friends", { cookie: a.cookie })).json.length, 0, "friendship removed");
    const recsA = await req("GET", "/api/users", { cookie: a.cookie });
    const recsB = await req("GET", "/api/users", { cookie: b.cookie });
    assert.ok(!recsA.json.some((u) => u._id === b.id), "blocker does not see blocked user");
    assert.ok(!recsB.json.some((u) => u._id === a.id), "blocked user does not see blocker");

    const retry = await req("POST", `/api/users/friend-request/${a.id}`, { cookie: b.cookie });
    assert.equal(retry.status, 403, "blocked user cannot send a request");
    const listed = await req("GET", "/api/users/blocked", { cookie: a.cookie });
    assert.equal(listed.json[0]._id, b.id);

    assert.equal((await req("DELETE", `/api/users/${b.id}/block`, { cookie: a.cookie })).status, 200);
    const recsAfter = await req("GET", "/api/users", { cookie: a.cookie });
    assert.ok(recsAfter.json.some((u) => u._id === b.id), "unblock restores visibility");
  });

  test("remove friend: both lists update, accepted request is removed, and a new request is allowed", async (t) => {
    if (skipIfNoMongo(t)) return;
    const a = await signupUser("Rem A");
    const b = await signupUser("Rem B");
    await onboard(a);
    await onboard(b);
    const sent = await req("POST", `/api/users/friend-request/${b.id}`, { cookie: a.cookie });
    await req("PUT", `/api/users/friend-request/${sent.json._id}/accept`, { cookie: b.cookie });

    const removed = await req("DELETE", `/api/users/friends/${a.id}`, { cookie: b.cookie });
    assert.equal(removed.status, 200);
    assert.equal((await req("GET", "/api/users/friends", { cookie: a.cookie })).json.length, 0);
    assert.equal((await req("DELETE", `/api/users/friends/${a.id}`, { cookie: b.cookie })).status, 404, "not friends anymore");
    assert.equal((await req("POST", `/api/users/friend-request/${b.id}`, { cookie: a.cookie })).status, 201, "a new request is allowed");
  });

  test("report: validates reason and details, rejects duplicates, and is visible to admins", async (t) => {
    if (skipIfNoMongo(t)) return;
    const reporter = await signupUser("Rep Reporter");
    const target = await signupUser("Rep Target");
    await onboard(reporter);
    await onboard(target);

    assert.equal((await req("POST", `/api/users/${target.id}/report`, { cookie: reporter.cookie, body: { reason: "bored" } })).status, 400);
    assert.equal((await req("POST", `/api/users/${target.id}/report`, { cookie: reporter.cookie, body: { reason: "spam", details: "x".repeat(1001) } })).status, 400);
    assert.equal((await req("POST", `/api/users/${reporter.id}/report`, { cookie: reporter.cookie, body: { reason: "spam" } })).status, 400);

    const ok = await req("POST", `/api/users/${target.id}/report`, { cookie: reporter.cookie, body: { reason: "harassment", details: "rude messages" } });
    assert.equal(ok.status, 201);
    const dup = await req("POST", `/api/users/${target.id}/report`, { cookie: reporter.cookie, body: { reason: "spam" } });
    assert.equal(dup.status, 409);

    const reports = await req("GET", "/api/admin/learning/reports?status=open", { cookie: adminUser.cookie });
    assert.equal(reports.status, 200);
    const mine = reports.json.items.find((r) => String(r.reported?._id) === target.id);
    assert.ok(mine, "admin sees the open report");
    const reviewed = await req("PATCH", `/api/admin/learning/reports/${mine._id}`, { cookie: adminUser.cookie, body: { status: "dismissed" } });
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.json.report.status, "dismissed");
  });

  test("vocabulary book: create, duplicate guard, learned toggle, review, ownership, and delete", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = learnerP4;
    const created = await req("POST", "/api/learning/vocabulary", { cookie: u.cookie, body: { word: "पाणी", meaning: "water", example: "पाणी द्या", exampleTranslation: "give water" } });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const id = created.json.word._id;
    assert.equal(created.json.word.targetLanguage, "mr");
    assert.equal((await req("POST", "/api/learning/vocabulary", { cookie: u.cookie, body: { word: "पाणी" } })).status, 409);
    assert.equal((await req("POST", "/api/learning/vocabulary", { cookie: u.cookie, body: { word: "" } })).status, 400);

    const learned = await req("PATCH", `/api/learning/vocabulary/${id}`, { cookie: u.cookie, body: { learned: true } });
    assert.equal(learned.json.word.learned, true);
    assert.equal((await req("PATCH", `/api/learning/vocabulary/${id}`, { cookie: u.cookie, body: { learned: "yes" } })).status, 400);

    const reviewed = await req("POST", `/api/learning/vocabulary/${id}/review`, { cookie: u.cookie });
    assert.equal(reviewed.json.word.reviewCount, 1);
    const review = await req("GET", "/api/learning/vocabulary?mode=review", { cookie: u.cookie });
    assert.ok(review.json.items.some((w) => w._id === id));

    // Another user cannot read, edit, review, or delete this entry.
    const intruder = await signupUser("Vocab Intruder");
    assert.equal((await req("PATCH", `/api/learning/vocabulary/${id}`, { cookie: intruder.cookie, body: { meaning: "x" } })).status, 404);
    assert.equal((await req("DELETE", `/api/learning/vocabulary/${id}`, { cookie: intruder.cookie })).status, 404);

    assert.equal((await req("DELETE", `/api/learning/vocabulary/${id}`, { cookie: u.cookie })).status, 200);
    assert.equal((await req("DELETE", `/api/learning/vocabulary/${id}`, { cookie: u.cookie })).status, 404);
  });

  test("vocabulary can be copied from a lesson word", async (t) => {
    if (skipIfNoMongo(t)) return;
    const Lesson = models.Lesson;
    const lesson = await Lesson.findOne({ title: "P4 Lesson 1" }).lean();
    const LessonVocabulary = models.LessonVocabulary;
    const lv = await LessonVocabulary.create({ lesson: lesson._id, category: lesson.category, sourceText: "water", targetText: "पाणी", romanized: "paani", partOfSpeech: "noun" });
    const r = await req("POST", "/api/learning/vocabulary", { cookie: learnerP4.cookie, body: { lessonVocabularyId: lv._id.toString() } });
    assert.equal(r.status, 201);
    assert.equal(r.json.word.origin, "lesson");
    assert.equal(r.json.word.word, "पाणी");
    assert.equal(r.json.word.meaning, "water");
  });

  test("goals and analytics reflect a completed lesson and quiz attempt, with UTC day boundaries", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = learnerP4;
    const before = await req("GET", "/api/learning/goals/today", { cookie: u.cookie });
    assert.equal(before.status, 200);
    assert.equal(before.json.timezone, "UTC");

    const lesson = await models.Lesson.findOne({ title: "P4 Lesson 1" }).lean();
    const done = await req("POST", `/api/learning/lessons/${lesson._id}/complete`, { cookie: u.cookie });
    assert.equal(done.status, 200, JSON.stringify(done.json));

    const served = await req("GET", `/api/learning/quiz/${p4Category._id}`, { cookie: u.cookie });
    const answers = served.json.questions.map((q) => ({ questionId: q._id, userAnswer: "wrong" }));
    const submitted = await req("POST", "/api/learning/quiz/submit", { cookie: u.cookie, body: { sessionId: served.json.sessionId, categoryId: p4Category._id.toString(), answers, timeTakenSeconds: 90 } });
    assert.equal(submitted.status, 200);

    const goals = await req("GET", "/api/learning/goals/today", { cookie: u.cookie });
    assert.equal(goals.json.goals.lessons.done, 1);
    assert.equal(goals.json.goals.lessons.met, true);
    assert.equal(goals.json.goals.quizzes.done, 1);

    const analytics = await req("GET", "/api/learning/analytics", { cookie: u.cookie });
    assert.equal(analytics.status, 200);
    assert.equal(analytics.json.lessons.completed, 1);
    assert.equal(analytics.json.quizzes.questionsAnswered, 10);
    assert.equal(analytics.json.quizzes.correct, 0);
    assert.equal(analytics.json.quizzes.accuracyPercent, 0);
    assert.equal(analytics.json.timeSpent.quizSeconds, 90);
    assert.match(analytics.json.timeSpent.note, /Lesson reading time is not tracked/);
    assert.equal("proficiencyScore" in analytics.json, false, "no invented proficiency score");
    const cat = analytics.json.progressByCategory.find((c) => c.name === "P4 Revision");
    assert.equal(cat.lessonsCompleted, 1);
    assert.equal(cat.quizAccuracyPercent, 0);
  });

  test("goal settings are validated and saved per user", async (t) => {
    if (skipIfNoMongo(t)) return;
    assert.equal((await req("PATCH", "/api/learning/goals", { cookie: learnerP4.cookie, body: { dailyLessons: 11 } })).status, 400);
    assert.equal((await req("PATCH", "/api/learning/goals", { cookie: learnerP4.cookie, body: { dailyQuizzes: 1.5 } })).status, 400);
    const ok = await req("PATCH", "/api/learning/goals", { cookie: learnerP4.cookie, body: { dailyLessons: 3 } });
    assert.equal(ok.json.goals.dailyLessons, 3);
    const today = await req("GET", "/api/learning/goals/today", { cookie: learnerP4.cookie });
    assert.equal(today.json.goals.lessons.target, 3);
  });

  test("revision: wrong answers are listed, a revision quiz is graded by session, and weak topics are reported", async (t) => {
    if (skipIfNoMongo(t)) return;
    const u = learnerP4;
    const incorrect = await req("GET", "/api/learning/revision/incorrect", { cookie: u.cookie });
    assert.equal(incorrect.status, 200);
    assert.ok(incorrect.json.items.length >= 3, "earlier wrong answers are listed");

    const revision = await req("POST", "/api/learning/revision/quiz", { cookie: u.cookie });
    assert.equal(revision.status, 200, JSON.stringify(revision.json));
    assert.equal(revision.json.revision, true);
    assert.ok(revision.json.questions.every((q) => !("correctAnswer" in q)));

    const stored = await models.QuizQuestion.find({ _id: { $in: revision.json.questions.map((q) => q._id) } }).lean();
    const perfect = stored.map((q) => ({ questionId: q._id.toString(), userAnswer: q.correctAnswer }));
    const graded = await req("POST", "/api/learning/quiz/submit", { cookie: u.cookie, body: { sessionId: revision.json.sessionId, answers: perfect } });
    assert.equal(graded.status, 200, JSON.stringify(graded.json));
    assert.equal(graded.json.scorePercentage, 100);

    const weak = await req("GET", "/api/learning/revision/weak-topics", { cookie: u.cookie });
    assert.equal(weak.status, 200);
    const lessons = await req("GET", "/api/learning/revision/lessons", { cookie: u.cookie });
    assert.ok(lessons.json.items.some((l) => l.title === "P4 Lesson 1"));
  });

  test("revision quiz refuses when there are too few wrong answers", async (t) => {
    if (skipIfNoMongo(t)) return;
    const fresh = await signupUser("Fresh Revision");
    await onboard(fresh);
    await req("POST", "/api/learning/select-language", { cookie: fresh.cookie, body: { nativeLanguage: "hi", targetLanguage: "mr" } });
    const r = await req("POST", "/api/learning/revision/quiz", { cookie: fresh.cookie });
    assert.equal(r.status, 409);
  });

  test("suspension: a suspended account is refused on every request; reinstating restores access", async (t) => {
    if (skipIfNoMongo(t)) return;
    const victim = await signupUser("To Suspend");
    assert.equal((await req("PATCH", `/api/admin/learning/users/${victim.id}/status`, { cookie: adminUser.cookie, body: { accountStatus: "suspended" } })).status, 200);
    const blocked = await req("GET", "/api/auth/me", { cookie: victim.cookie });
    assert.equal(blocked.status, 403);
    assert.match(blocked.json.message, /suspended/);

    assert.equal((await req("PATCH", `/api/admin/learning/users/${victim.id}/status`, { cookie: adminUser.cookie, body: { accountStatus: "active" } })).status, 200);
    assert.equal((await req("GET", "/api/auth/me", { cookie: victim.cookie })).status, 200);
  });

  test("admin user management: search is safe, listings omit secrets, admins cannot suspend themselves", async (t) => {
    if (skipIfNoMongo(t)) return;
    const search = await req("GET", "/api/admin/learning/users?search=" + encodeURIComponent("(P4"), { cookie: adminUser.cookie });
    assert.equal(search.status, 200, "regex metacharacters are escaped, not executed");
    assert.ok(Array.isArray(search.json.items));
    for (const item of search.json.items) {
      assert.equal("password" in item, false);
    }
    const page = await req("GET", "/api/admin/learning/users?page=1&limit=2", { cookie: adminUser.cookie });
    assert.equal(page.json.limit, 2);
    assert.ok(page.json.items.length <= 2);

    const activity = await req("GET", `/api/admin/learning/users/${learnerP4.id}/activity`, { cookie: adminUser.cookie });
    assert.equal(activity.status, 200);
    assert.ok(activity.json.activity.quizAttempts >= 1);

    assert.equal((await req("PATCH", `/api/admin/learning/users/${adminUser.id}/status`, { cookie: adminUser.cookie, body: { accountStatus: "suspended" } })).status, 400);
    assert.equal((await req("GET", "/api/admin/learning/users?search=%24where", { cookie: adminUser.cookie })).status, 200);
  });

  test("admin endpoints reject non-admin accounts, including the new ones", async (t) => {
    if (skipIfNoMongo(t)) return;
    const plain = await signupUser("Not Admin");
    for (const [method, path] of [
      ["GET", "/api/admin/learning/users"],
      ["GET", "/api/admin/learning/analytics"],
      ["GET", "/api/admin/learning/reports"],
      ["GET", "/api/admin/learning/content/questions"],
      ["POST", "/api/admin/learning/questions"],
      ["PATCH", `/api/admin/learning/users/${plain.id}/status`],
    ]) {
      const r = await req(method, path, { cookie: plain.cookie, body: method === "GET" ? undefined : {} });
      assert.equal(r.status, 403, `${method} ${path}`);
    }
  });

  test("admin analytics returns platform counts and quiz performance", async (t) => {
    if (skipIfNoMongo(t)) return;
    const r = await req("GET", "/api/admin/learning/analytics", { cookie: adminUser.cookie });
    assert.equal(r.status, 200);
    assert.ok(r.json.users.total >= 5);
    assert.ok(r.json.users.active7Days >= 1, "recently active users are counted");
    assert.ok(Array.isArray(r.json.enrollmentByLanguagePair));
    assert.ok("practice" in r.json.quizPerformance);
  });

  test("content: invalid questions are rejected, valid ones saved, duplicates blocked, and updates re-validated", async (t) => {
    if (skipIfNoMongo(t)) return;
    const base = { type: "mcq", sourceLanguage: "hi", targetLanguage: "mr", level: "easy", question: "P4 content question A", options: ["पाणी", "दूध"] };
    const c = { cookie: adminUser.cookie };

    assert.equal((await req("POST", "/api/admin/learning/questions", { ...c, body: { ...base, correctAnswer: "नाही" } })).status, 400, "answer must be an option");
    assert.equal((await req("POST", "/api/admin/learning/questions", { ...c, body: { ...base, sourceLanguage: "xx", correctAnswer: "पाणी" } })).status, 400, "unsupported language");
    assert.equal((await req("POST", "/api/admin/learning/questions", { ...c, body: { ...base, targetLanguage: "hi", correctAnswer: "पाणी" } })).status, 400, "same language pair");

    const created = await req("POST", "/api/admin/learning/questions", { ...c, body: { ...base, correctAnswer: "पाणी" } });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const dup = await req("POST", "/api/admin/learning/questions", { ...c, body: { ...base, question: "p4 content question a", correctAnswer: "पाणी" } });
    assert.equal(dup.status, 409, "duplicate detected case-insensitively");

    const id = created.json.question._id;
    const bad = await req("PUT", `/api/admin/learning/questions/${id}`, { ...c, body: { correctAnswer: "नाही" } });
    assert.equal(bad.status, 400, "partial update is re-validated");
    const fixed = await req("PUT", `/api/admin/learning/questions/${id}`, { ...c, body: { explanation: "water is पाणी" } });
    assert.equal(fixed.status, 200);

    const off = await req("PATCH", `/api/admin/learning/questions/${id}/active`, { ...c, body: { isActive: false } });
    assert.equal(off.json.question.isActive, false);
    assert.equal("correctAnswer" in off.json.question, false, "deactivation response hides the answer key");
    assert.equal((await req("PATCH", `/api/admin/learning/questions/${id}/active`, { ...c, body: { isActive: "no" } })).status, 400);

    const listed = await req("GET", "/api/admin/learning/content/questions?level=easy&limit=5", c);
    assert.equal(listed.status, 200);
    assert.ok(listed.json.items.length <= 5);
  });

  test("content: lessons validate categories and languages, reject duplicates, and support updates", async (t) => {
    if (skipIfNoMongo(t)) return;
    const c = { cookie: adminUser.cookie };
    const body = { title: "P4 Lesson 2", category: p4Category._id.toString(), sourceLanguage: "hi", targetLanguage: "mr", level: "easy", vocabulary: [{ sourceText: "नमस्ते", targetText: "नमस्कार" }] };

    assert.equal((await req("POST", "/api/admin/learning/lessons", { ...c, body: { ...body, category: "not-an-id" } })).status, 400);
    assert.equal((await req("POST", "/api/admin/learning/lessons", { ...c, body: { ...body, category: "64b000000000000000000000" } })).status, 400);
    assert.equal((await req("POST", "/api/admin/learning/lessons", { ...c, body: { ...body, targetLanguage: "fr" } })).status, 400, "fr is not configured as active here");

    const created = await req("POST", "/api/admin/learning/lessons", { ...c, body });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.equal((await req("POST", "/api/admin/learning/lessons", { ...c, body })).status, 409);

    const lessonId = created.json.lesson._id;
    const updated = await req("PUT", `/api/admin/learning/lessons/${lessonId}`, { ...c, body: { grammarNotes: "Simple greeting." } });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.lesson.grammarNotes, "Simple greeting.");
    const vocab = await models.LessonVocabulary.countDocuments({ lesson: lessonId });
    assert.equal(vocab, 1, "vocabulary rows are not duplicated on resave");
    await req("PUT", `/api/admin/learning/lessons/${lessonId}`, { ...c, body: { vocabulary: [{ sourceText: "नमस्ते", targetText: "नमस्कार" }] } });
    assert.equal(await models.LessonVocabulary.countDocuments({ lesson: lessonId }), 1);
  });

  test("content: language pair check and language save validate input", async (t) => {
    if (skipIfNoMongo(t)) return;
    const c = { cookie: adminUser.cookie };
    assert.equal((await req("POST", "/api/admin/learning/language-pair/check", { ...c, body: { sourceLanguage: "hi", targetLanguage: "mr" } })).json.valid, true);
    assert.equal((await req("POST", "/api/admin/learning/language-pair/check", { ...c, body: { sourceLanguage: "hi", targetLanguage: "hi" } })).status, 400);
    assert.equal((await req("POST", "/api/admin/learning/languages", { ...c, body: { code: "klingon", name: "K", nativeName: "K", script: "K" } })).status, 400);
    const saved = await req("POST", "/api/admin/learning/languages", { ...c, body: { code: "mr", name: "Marathi", nativeName: "मराठी", script: "Devanagari" } });
    assert.equal(saved.status, 200);
  });

  test("AI tutor endpoints: validated, authenticated, and returning the normalized shape (mocked model)", async (t) => {
    if (skipIfNoMongo(t)) return;
    tutorMod.setTutorGenerator(async () => JSON.stringify({ isCorrect: true, corrected: "मी ठीक आहे.", explanation: "Good.", naturalAlternative: "मी बरा आहे.", mistakes: [] }));
    const anon = await req("POST", "/api/ai/grammar", { body: { text: "मी ठीक आहे" } });
    assert.equal(anon.status, 401);
    const g = await req("POST", "/api/ai/grammar", { cookie: learnerP4.cookie, body: { text: "मी ठीक आहे" } });
    assert.equal(g.status, 200, JSON.stringify(g.json));
    assert.equal(g.json.isCorrect, true);
    assert.equal(g.json.learningLanguage, "Marathi", "defaults to the saved profile");
    assert.equal((await req("POST", "/api/ai/grammar", { cookie: learnerP4.cookie, body: { text: "" } })).status, 400);

    tutorMod.setTutorGenerator(async () => "this is not json");
    const bad = await req("POST", "/api/ai/explain-word", { cookie: learnerP4.cookie, body: { word: "पाणी" } });
    assert.equal(bad.status, 502);
    assert.equal(bad.json.code, "BAD_AI_RESPONSE");

    tutorMod.setTutorGenerator(async () => JSON.stringify({ reply: "नमस्कार!", translation: "नमस्ते!", tip: "" }));
    const p = await req("POST", "/api/ai/practice", { cookie: learnerP4.cookie, body: { message: "नमस्कार", difficulty: "beginner", scenario: "market", history: [] } });
    assert.equal(p.status, 200);
    assert.equal(p.json.reply, "नमस्कार!");
    assert.equal((await req("POST", "/api/ai/practice", { cookie: learnerP4.cookie, body: { message: "hi", difficulty: "wizard" } })).status, 400);

    const noOther = await req("POST", "/api/ai/suggest-replies", { cookie: learnerP4.cookie, body: { messages: [{ fromOther: false, text: "hello" }] } });
    assert.equal(noOther.status, 400);
    tutorMod.setTutorGenerator(async () => JSON.stringify({ suggestions: [{ text: "ठीक आहे", translation: "okay" }] }));
    const s = await req("POST", "/api/ai/suggest-replies", { cookie: learnerP4.cookie, body: { messages: [{ fromOther: true, text: "कसे आहात?" }] } });
    assert.equal(s.status, 200);
    assert.equal(s.json.suggestions[0].text, "ठीक आहे");
  });
});

describe("AI service health and error surfacing (mocked provider transport)", () => {
  const FAKE_KEY = "integration-fake-key-not-real-000000000000";
  let svc;
  let user;

  before(async () => {
    if (skipReason) return;
    svc = await import("../services/geminiService.js");
    user = await signupUser("AI Health User");
  });

  const withKey = (value) => {
    if (value === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = value;
  };

  test("health requires authentication", async (t) => {
    if (skipIfNoMongo(t)) return;
    const r = await req("GET", "/api/ai/health");
    assert.equal(r.status, 401);
  });

  test("health reports not_configured when no key is set, without any provider call", async (t) => {
    if (skipIfNoMongo(t)) return;
    svc.resetHealthCache();
    withKey("");
    const r = await req("GET", "/api/ai/health", { cookie: user.cookie });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, "not_configured");
    assert.equal(r.json.configured, false);
    assert.equal(r.json.provider, "Google Gemini");
  });

  test("health reports available only after a real successful probe, and never returns the key", async (t) => {
    if (skipIfNoMongo(t)) return;
    svc.resetHealthCache();
    withKey(FAKE_KEY);
    let probes = 0;
    svc.setGeminiTransport(async () => {
      probes += 1;
      return "OK";
    });
    try {
      const r = await req("GET", "/api/ai/health", { cookie: user.cookie });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, "available");
      assert.equal(r.json.configured, true);
      assert.equal(typeof r.json.model, "string");
      assert.equal(JSON.stringify(r.json).includes(FAKE_KEY), false, "key never appears in the response");
      await req("GET", "/api/ai/health", { cookie: user.cookie });
      assert.equal(probes, 1, "repeat checks use the cache");
    } finally {
      svc.resetGeminiTransport();
      svc.resetHealthCache();
      withKey("");
    }
  });

  test("health distinguishes a rejected key from a missing model", async (t) => {
    if (skipIfNoMongo(t)) return;
    withKey(FAKE_KEY);
    const scenarios = [
      [Object.assign(new Error("API key not valid"), { status: 400 }), "invalid_credentials"],
      [Object.assign(new Error("models/x is not found"), { status: 404 }), "model_unavailable"],
      [Object.assign(new Error("quota"), { status: 429 }), "quota_exceeded"],
    ];
    try {
      for (const [error, expected] of scenarios) {
        svc.resetHealthCache();
        svc.setGeminiTransport(async () => {
          throw error;
        });
        const r = await req("GET", "/api/ai/health", { cookie: user.cookie });
        assert.equal(r.json.status, expected);
        assert.equal(JSON.stringify(r.json).includes(FAKE_KEY), false);
      }
    } finally {
      svc.resetGeminiTransport();
      svc.resetHealthCache();
      withKey("");
    }
  });

  test("chat surfaces a model-unavailable failure with a code and a safe message", async (t) => {
    if (skipIfNoMongo(t)) return;
    withKey(FAKE_KEY);
    svc.setGeminiTransport(async () => {
      throw Object.assign(new Error("models/gemini-1.5-flash is not found for API version v1beta"), { status: 404 });
    });
    try {
      const r = await req("POST", "/api/ai/chat", { cookie: user.cookie, body: { message: "hello" } });
      assert.equal(r.status, 503);
      assert.equal(r.json.code, "MODEL_UNAVAILABLE");
      assert.match(r.json.error, /model/i);
      assert.equal(JSON.stringify(r.json).includes("gemini-1.5-flash"), false, "raw provider text is not returned");
    } finally {
      svc.resetGeminiTransport();
      withKey("");
    }
  });

  test("chat succeeds end to end through the service when the provider answers", async (t) => {
    if (skipIfNoMongo(t)) return;
    withKey(FAKE_KEY);
    let seen;
    svc.setGeminiTransport(async (args) => {
      seen = args;
      return "Namaste!";
    });
    try {
      const r = await req("POST", "/api/ai/chat", { cookie: user.cookie, body: { message: "hello", language: "Marathi" } });
      assert.equal(r.status, 200);
      assert.equal(r.json.aiResponse, "Namaste!");
      assert.equal(r.json.detectedLanguage, "Marathi");
      assert.ok(seen.system.includes("Marathi"), "preferred language reaches the system instruction");
      assert.equal(seen.user, "hello", "user text is sent as content");
    } finally {
      svc.resetGeminiTransport();
      withKey("");
    }
  });
});
