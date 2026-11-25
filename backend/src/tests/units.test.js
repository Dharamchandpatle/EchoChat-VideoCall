import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET_KEY ||= "test-secret";

const { rateLimit } = await import("../middleware/rateLimit.middleware.js");
const { protectRoute } = await import("../middleware/auth.middleware.js");
const { toLanguageCode, validateText, MAX_TEXT_LENGTH } = await import("../controllers/ai.controller.js");
const User = (await import("../models/User.js")).default;

const fakeRes = () => {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
};

test("rate limiter allows up to max then returns 429 with Retry-After", () => {
  const limiter = rateLimit({ windowMs: 60_000, max: 2, name: "unit-test" });
  const req = { ip: "1.2.3.4" };
  let passed = 0;
  let last = null;
  for (let i = 0; i < 3; i += 1) {
    last = fakeRes();
    limiter(req, last, () => (passed += 1));
  }
  assert.equal(passed, 2);
  assert.equal(last.statusCode, 429);
  assert.ok(last.headers["Retry-After"]);
});

test("rate limiter isolates clients by IP", () => {
  const limiter = rateLimit({ windowMs: 60_000, max: 1, name: "unit-test-ip" });
  let passed = 0;
  limiter({ ip: "a" }, fakeRes(), () => (passed += 1));
  limiter({ ip: "b" }, fakeRes(), () => (passed += 1));
  assert.equal(passed, 2);
});

test("protectRoute: missing cookie returns 401 without touching the database", async () => {
  const res = fakeRes();
  await protectRoute({ cookies: {} }, res, () => assert.fail("must not call next"));
  assert.equal(res.statusCode, 401);
});

test("protectRoute: tampered token returns 401 (not 503)", async () => {
  const res = fakeRes();
  await protectRoute({ cookies: { jwt: "not.a.jwt" } }, res, () => assert.fail("must not call next"));
  assert.equal(res.statusCode, 401);
});

test("protectRoute: expired token returns 401 with a session-expired message", async () => {
  const expired = jwt.sign(
    { userId: "507f1f77bcf86cd799439011", exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET_KEY
  );
  const res = fakeRes();
  await protectRoute({ cookies: { jwt: expired } }, res, () => assert.fail("must not call next"));
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /expired/i);
});

test("protectRoute: token signed with a different secret is rejected", async () => {
  const forged = jwt.sign({ userId: "507f1f77bcf86cd799439011" }, "attacker-secret");
  const res = fakeRes();
  await protectRoute({ cookies: { jwt: forged } }, res, () => assert.fail("must not call next"));
  assert.equal(res.statusCode, 401);
});

test("User JSON never contains the password hash or __v", () => {
  const user = new User({ fullName: "Test", email: "t@example.com", password: "$2a$10$hashhashhash" });
  const json = user.toJSON();
  assert.equal("password" in json, false);
  assert.equal("__v" in json, false);
  assert.equal(json.email, "t@example.com");
});

test("language names and codes normalize to ISO-style codes", () => {
  assert.equal(toLanguageCode("Hindi"), "hi");
  assert.equal(toLanguageCode("marathi"), "mr");
  assert.equal(toLanguageCode("hi"), "hi");
  assert.equal(toLanguageCode("<script>", "en"), "en", "invalid values fall back");
  assert.equal(toLanguageCode(42, "en"), "en");
});

test("text validation rejects empty, non-string and oversized input", () => {
  assert.ok(validateText("").error);
  assert.ok(validateText("   ").error);
  assert.ok(validateText(123).error);
  assert.ok(validateText("a".repeat(MAX_TEXT_LENGTH + 1)).error);
  assert.equal(validateText("  hello  ").value, "hello");
});
