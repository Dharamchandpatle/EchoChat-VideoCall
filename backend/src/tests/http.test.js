// HTTP-level tests against the real Express app. No database or external credentials are needed:
// every request here is rejected by validation, authentication, or routing before a DB call.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET_KEY ||= "test-secret";
process.env.NODE_ENV = "test";
delete process.env.ALLOW_SELF_ADMIN_CLAIM;

const { default: app } = await import("../server.js");

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const call = async (method, path, { body, cookie, raw } = {}) => {
  const headers = {};
  if (body !== undefined || raw !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + path, {
    method,
    headers,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
};

test("health endpoint responds without auth", async () => {
  const r = await call("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "ok");
});

test("unknown /api route returns JSON 404", async () => {
  const r = await call("GET", "/api/does-not-exist");
  assert.equal(r.status, 404);
  assert.match(r.json.message, /Route not found/);
});

test("malformed JSON body returns 400 JSON, not an HTML stack trace", async () => {
  const r = await call("POST", "/api/auth/login", {
    raw: "{not json",
    cookie: "",
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.message, "Malformed JSON body");
});

test("oversized JSON body is rejected with 413", async () => {
  const big = JSON.stringify({ message: "x".repeat(200 * 1024) });
  const r = await call("POST", "/api/ai/chat", { raw: big });
  assert.equal(r.status, 413);
});

test("protected user routes reject anonymous callers with 401", async () => {
  for (const path of ["/api/users", "/api/users/friends", "/api/users/friend-requests", "/api/chat/token", "/api/learning/progress", "/api/ai/chat"]) {
    const r = await call(path.startsWith("/api/ai") ? "POST" : "GET", path, { body: path.startsWith("/api/ai") ? { message: "hi" } : undefined });
    assert.equal(r.status, 401, `expected 401 for ${path}, got ${r.status}`);
  }
});

test("a forged JWT cookie is rejected with 401", async () => {
  const forged = jwt.sign({ userId: "507f1f77bcf86cd799439011" }, "attacker");
  const r = await call("GET", "/api/auth/me", { cookie: `jwt=${forged}` });
  assert.equal(r.status, 401);
});

test("admin endpoints reject anonymous callers with 401", async () => {
  const r = await call("GET", "/api/admin/learning/stats");
  assert.equal(r.status, 401);
});

test("claim-admin is disabled (404) unless explicitly enabled outside production", async () => {
  const r = await call("POST", "/api/admin/learning/claim-admin");
  assert.equal(r.status, 404, "claim-admin must not be reachable by default");
});

test("signup validates required fields before any database access", async () => {
  const r = await call("POST", "/api/auth/signup", { body: { email: "a@b.co" } });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /required/i);
});

test("signup rejects invalid email and short passwords", async () => {
  const badEmail = await call("POST", "/api/auth/signup", { body: { email: "nope", password: "secret1", fullName: "A" } });
  assert.equal(badEmail.status, 400);
  assert.match(badEmail.json.message, /email/i);

  const shortPw = await call("POST", "/api/auth/signup", { body: { email: "a@b.co", password: "123", fullName: "A" } });
  assert.equal(shortPw.status, 400);
  assert.match(shortPw.json.message, /8 characters/);
});

test("login requires both fields", async () => {
  const r = await call("POST", "/api/auth/login", { body: { email: "a@b.co" } });
  assert.equal(r.status, 400);
});

test("logout clears the jwt cookie with matching attributes", async () => {
  const r = await call("POST", "/api/auth/logout");
  assert.equal(r.status, 200);
  const setCookie = r.headers.get("set-cookie") || "";
  assert.match(setCookie, /^jwt=;/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
});

test("auth limiter returns 429 after repeated credential attempts", async () => {
  // The login limiter allows 30 requests per 15 minutes per IP. Validation failures still count.
  let last = null;
  for (let i = 0; i < 31; i += 1) {
    last = await call("POST", "/api/auth/login", { body: { email: "x@y.co" } });
  }
  assert.equal(last.status, 429);
  assert.ok(last.headers.get("retry-after"));
});
