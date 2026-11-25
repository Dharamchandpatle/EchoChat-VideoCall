// Cross-origin request rejection for state-changing API calls (no database needed).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET_KEY ||= "test-secret";
process.env.NODE_ENV = "test";
process.env.CLIENT_URL = "https://app.example.com";

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

const post = (path, origin) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({}),
  });

test("state-changing request from an unknown origin is rejected with 403", async () => {
  const r = await post("/api/auth/logout", "https://evil.example");
  assert.equal(r.status, 403);
  assert.match((await r.json()).message, /Cross-origin/);
});

test("state-changing request from an allowed CLIENT_URL origin passes the origin check", async () => {
  const r = await post("/api/auth/logout", "https://app.example.com");
  assert.equal(r.status, 200);
});

test("the local Vite dev origin is allowed", async () => {
  const r = await post("/api/auth/logout", "http://localhost:5173");
  assert.equal(r.status, 200);
});

test("requests without an Origin header (non-browser clients) are not blocked by the origin check", async () => {
  const r = await post("/api/auth/logout", null);
  assert.equal(r.status, 200);
});

test("safe methods are never blocked by the origin check", async () => {
  const r = await fetch(base + "/api/health", { headers: { Origin: "https://evil.example" } });
  assert.equal(r.status, 200);
});

test("the server's own host origin is allowed (same-origin deployments)", async () => {
  const host = new URL(base).host;
  const r = await post("/api/auth/logout", `http://${host}`);
  assert.equal(r.status, 200);
});
