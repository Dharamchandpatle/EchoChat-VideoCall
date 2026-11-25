# EchoChat — Bug and Security Audit

Phase 1 audit: 2026-11-24. **Phase 2 repair report: same session, see §0.** Severity: **Critical** · **High** · **Medium** · **Low**.

## 0. Phase 2 completion report

### 0.1 Status summary

| Area | Result |
|---|---|
| Backend unit + HTTP + integration tests | **62 / 62 pass** (`npm test`) |
| Learning seed/content test | **Pass** (`npm run test:seed`) |
| Database integration tests | **30 / 30 pass** against an in-memory MongoDB (`npm test`). See §0.4. |
| Frontend ESLint | **Pass, 0 errors** (was 8) |
| Frontend production build | **Pass** |
| Backend startup | **Verified** on the failure path (no DB → logs the cause, exit 1). Success path requires MongoDB; not run. |
| Stream Chat / Stream Video | **Not verified at runtime** (no credentials). Code hardened; see §0.5. |
| Gemini / MyMemory | **Not verified at runtime** (no credentials). Code hardened; see §0.5. |

### 0.2 Fixed issues

| ID | Severity | Fix | Root cause | Modified files |
|---|---|---|---|---|
| C1 | Critical | `claim-admin` now returns **404** unless `NODE_ENV !== production` **and** `ALLOW_SELF_ADMIN_CLAIM=true`. The gate runs *before* auth, so the route is not discoverable. Admins are provisioned with `npm run admin:grant -- <email>` (operator script). | Test-only endpoint shipped on the public router with no environment gate. | `routes/adminLearning.route.js`, `scripts/grantAdmin.js` (new), `package.json` |
| C2 | Critical | Recommendations project only public fields (`fullName profilePic nativeLanguage learningLanguage location bio`), exclude self, friends and pending-request users, limit 50. | `User.find()` with no projection. | `controllers/user.controller.js` |
| C3 | Critical | `User` schema `toJSON` removes `password` and `__v` globally. Signup/login now return sanitized users. Login uses the same 401 message for unknown email and wrong password. | Hash serialized in responses. | `models/User.js`, `controllers/auth.controller.js` |
| C4 | Critical | Onboarding and new `PATCH /auth/profile` **whitelist** fields (`fullName, bio, nativeLanguage, learningLanguage, location, profilePic`) and run validators. Role, email, friends, password are ignored. | `...req.body` spread into `findByIdAndUpdate`. | `controllers/auth.controller.js`, `routes/auth.route.js` |
| C5 | Critical | Quizzes and assessments are **server sessions** (`QuizSession`). Fetch returns `sessionId` and records the served question IDs. Submit grades **only those IDs**, uses the **session size** as denominator, rejects unknown/duplicate answers (400, session stays open), and atomically claims the session (second submit → 409; another user → 404; expired → 410). Frontend sends `sessionId`. | Client chose which question IDs to grade and the denominator; any answer probe revealed `correctAnswer`. | `models/QuizSession.js` (new), `lib/learningGrading.js` (new), `controllers/learning.controller.js`, `pages/learning/QuizPage.jsx`, `pages/learning/AssessmentPage.jsx` |
| H1 | High | Same session mechanism covers practice quizzes. | Same as C5. | as C5 |
| H3 | High | In-memory rate limits: auth (30 / 15 min / IP, configurable via `AUTH_RATE_LIMIT_MAX`), AI (20 / min / IP). Returns 429 + `Retry-After`. JSON body limit 100 kB. | No limiter. | `middleware/rateLimit.middleware.js` (new), `routes/auth.route.js`, `routes/ai.route.js`, `server.js` |
| H4 | High | AI: user text is sent as **content**, not spliced into the instruction; instructions use `systemInstruction`; input length capped at 2000 chars and validated. | Prompt concatenation. | `controllers/ai.controller.js` |
| H5 | High | `protectRoute`: JWT errors → **401** (expired gives "Session expired"); only DB errors → 503. Algorithm pinned to HS256. Frontend listens for 401 and re-checks the session (`AUTH_EXPIRED_EVENT`). | Catch-all returned 503. | `middleware/auth.middleware.js`, `lib/axios.js`, `App.jsx` |
| R2 | High | Translation accepts language **names or codes** (`"Hindi"` → `hi`) and maps them for the MyMemory fallback. MyMemory "error in body" responses are treated as failures. | Names sent to MyMemory. | `controllers/ai.controller.js` |
| R1 | High | Gemini client created lazily. Missing key → clear **503 "not configured"** instead of crashing at import. 429 from Gemini is mapped to 429. Model name still defaults to `gemini-1.5-flash` and is configurable via `GEMINI_MODEL` (see §0.5). | Eager client, no error mapping. | `controllers/ai.controller.js` |
| R4 | Medium | Accept uses a **guarded transition** (`status: pending` + recipient) → 409 when not pending, 404 when missing, 403 for wrong user. Friend writes are a single bulk write; on failure the request is rolled back to pending. | No status check, three separate writes. | `controllers/user.controller.js` |
| R5 | Medium | `select-language` and `complete-lesson` validate types/ids (400 instead of 500). | Unchecked `req.body` strings. | `controllers/learning.controller.js` |
| M1 | Medium | Stream tokens expire after 24 h (`createToken(id, exp, iat)`). | No expiry. | `lib/stream.js` |
| M2 | Medium | `completeLesson` requires the lesson to be published, in the user's **active language pair**, and in an **unlocked level** (403 otherwise). Prerequisite *within* a category is not enforced. | No check. | `controllers/learning.controller.js` |
| M4 | Medium | Chat sync allowed only for self, friends, or admins (403 otherwise; 400 for bad ids). | Any user could sync any id. | `controllers/chat.controller.js` |
| M5 | Medium | CORS allow-list from `CLIENT_URL` (comma-separated) plus localhost:5173. | Hard-coded origin. | `server.js` |
| M9 | Medium | Friend accept: see R4 (guarded transition + compensating rollback; no multi-document transaction). | Non-atomic writes. | `controllers/user.controller.js` |
| M10 / D3 | Medium | `FriendRequest` unique `{sender, recipient}` index; reject/cancel delete the document so re-requesting works. | No unique index; no reject. | `models/FriendRequest.js`, `controllers/user.controller.js`, `routes/user.route.js` |
| R6 | Medium | `__dirname` derived from `import.meta.url` (not the cwd). | `path.resolve()` depended on cwd. | `server.js` |
| R7 | Medium | DB connect failure and listen/seed failures are reported separately; process exits 1 on DB failure. | One catch-all message. | `server.js` |
| R8 | Medium | Frontend API base URL: `VITE_API_URL` overrides the dev default. | Hard-coded port. | `frontend/src/lib/axios.js` |
| R9 | Low | Removed `"streamify": "file:.."` self-dependency from both `package.json` files (lockfiles regenerated). | Meaningless self-reference. | `backend/package.json`, `frontend/package.json`, both lockfiles |
| R10 | Low | Missing `GEMINI_API_KEY` is reported at request time as 503 (see R1). | — | `controllers/ai.controller.js` |
| R11 | Low | Question shuffle uses Fisher–Yates. | `sort(() => Math.random() - 0.5)` is biased. | `controllers/learning.controller.js` |
| R13 | Low | Recommendations limited to 50. | No limit. | `controllers/user.controller.js` |
| F1 | High | Frontend ESLint **0 errors**. Dead code removed (`handleTranslate` in FloatingChatBot, which had no UI entry point); unused variables removed; `getLanguageFlag` moved to `lib/languageFlag.jsx` (fast-refresh rule). | Unused variables; component module exporting a helper. | `pages/learning/*.jsx`, `pages/ChatPage.jsx`, `components/FloatingChatBot.jsx`, `components/FriendCard.jsx`, `pages/HomePage.jsx`, `lib/languageFlag.jsx` (new) |
| F-new | High | **Reject friend request** UI added (Decline button) and wired to the new endpoint. | Feature missing. | `pages/NotificationsPage.jsx`, `lib/api.js` |
| F-new | Medium | Quiz/assessment submit errors refresh the quiz so a retry uses a valid session. | Stale session after 409/410. | `pages/learning/QuizPage.jsx`, `pages/learning/AssessmentPage.jsx` |
| Global | Medium | Central error handling: JSON 404 for unknown `/api` routes, malformed JSON → 400, oversized → 413, no stack traces to clients, `X-Powered-By` disabled. | Express default HTML responses. | `middleware/errors.middleware.js` (new), `server.js` |
| Global | Medium | `GET /api/health` added. | — | `server.js` |

### 0.3 Remaining issues (not fixed, with reason)

| ID | Severity | Issue | Why not fixed in this pass |
|---|---|---|---|
| R1-b | High | Default Gemini model `gemini-1.5-flash` may be retired. | Needs a live Gemini key to confirm the current model name. Set `GEMINI_MODEL` in `.env`. |
| C5-b | Medium | After a quiz is submitted its correct answers are returned in feedback. Repeated quizzes can therefore reveal the question bank over time. | Revealing answers after submission is the existing UX. Removing it needs a product decision. Sessions already stop probing arbitrary IDs. |
| H3-b | Medium | Rate limiter is in-memory (per process). | Fine for one instance; use a shared store when scaling out. |
| H-helmet | Medium | No `helmet` security headers. | Not installed (no network-verified install in this pass). |
| M8 | Medium | Logout does not revoke the JWT server-side (7-day token). | Needs a token-version or denylist store. |
| M6 | Low | Signup returns 409 for an existing email (account enumeration). | Kept for usability; a product decision. |
| M3 | Low | Admin page is auth-gated on the client; server enforces. | Works; UX only. |
| R12 | Low | Learning progress updates are read-modify-write (rare races). Session claim is atomic. | Needs `$inc`/`$set` refactor of the progress documents. |
| R6-b | Low | Production static serving not exercised (no `NODE_ENV=production` run). | Needs a production build run. |
| F2 | Medium | Frontend bundle 2.3 MB (single chunk). | Code-splitting is a refactor; not done. |
| F4 | Needs verification | Four question types (`mcq`, `fill_blank`, `translate`, `correct_sentence`) rely on the generic renderer. | Needs a browser pass. |
| F5 | Needs verification | Stream client lifecycle across logout/login and reconnection. | Needs live Stream credentials. |
| — | Feature gap | Profile edit has an API (`PATCH /api/auth/profile`) but **no UI**. | Not in scope for the repair pass; API is tested. |
| — | Feature gap | Admin UI for languages, categories, lessons and questions is still API-only. | Feature work, not a repair. |
| — | Feature gap | Call invitations and presence are not implemented. | Feature work (Stream-dependent). |

### 0.4 Tests executed

| Command | Result | Notes |
|---|---|---|
| `npm run test:unit` (backend) | **32 pass, 0 fail** | `grading.test.js` (10): scoring, denominator, duplicates, unknown IDs, match/arrange rules. `units.test.js` (9): rate limiter, JWT 401 paths incl. expired and forged tokens, User JSON, AI input helpers. `http.test.js` (13): real Express app over HTTP — auth gating on every protected route, forged cookie, JSON 404, malformed JSON, 413, claim-admin 404, signup/login validation, logout cookie attributes, 429 after limit. |
| `npm run test:seed` (backend) | **Pass** | Existing 7 content checks. |
| `node src/server.js` with unreachable `MONGO_URI` | **Pass (expected failure)** | Logs cause, exit code 1. |
| `npx eslint .` (frontend) | **Pass, 0 errors** | Was 8. |
| `npx vite build` (frontend) | **Pass** | Chunk-size warning remains (F2). |
| `node --check` on all changed backend files | **Pass** | |
| `npm test` (integration, 30 cases) | **30 / 30 pass** | Real MongoDB 7.0.24 via mongodb-memory-server. Covers auth, friends (incl. accept authorization, which exposed a 409-vs-403 bug, now fixed), admin gating, quiz and assessment sessions, duplicate and cross-user submissions, lesson pair checks, AI not-configured path. Stream and Gemini are deliberately unconfigured. |

**To run the integration suite** (use a throwaway database; the suite drops it, and refuses names without "test"):

```
# Option A: any local MongoDB
set MONGO_TEST_URI=mongodb://127.0.0.1:27017/echochat_test
npm test --prefix backend

# Option B: automatic in-memory MongoDB (downloads ~600 MB once)
npm test --prefix backend
```

The in-memory MongoDB binary (600 MB) finished downloading, and the suite was executed in full: **62 pass, 0 fail**. Two failures found on the first run were fixed: (1) accept by a non-recipient returned 409 instead of 403 (authorization is now checked before the state check); (2) the AI test picked up a real `GEMINI_API_KEY` from `backend/.env` via dotenv. The test now sets the Stream and Gemini variables to empty strings, which dotenv will not override.

### 0.5 External services requiring credentials

| Service | Needed for | Status | What to do |
|---|---|---|---|
| MongoDB | Integration tests; running the app | Not available locally | Set `MONGO_TEST_URI` to a throwaway DB, or let `mongodb-memory-server` finish its download. |
| Stream Chat/Video | Chat, token, video, user sync | Code hardened and failure paths tested; **no live test** | Set `STREAM_API_KEY`/`STREAM_API_SECRET` (server) and `VITE_STREAM_API_KEY` (frontend, public key). Verify messaging, video join, and reconnect manually. |
| Gemini | AI chat, translate, detect | Failure paths tested; **no live test** | Set `GEMINI_API_KEY`. Confirm `GEMINI_MODEL` (default `gemini-1.5-flash` may be retired). |
| MyMemory | Translation fallback | Mapping and error-body handling tested; **no live call** | None (public API). |

### 0.6 Modified files (Phase 2)

Backend: `server.js`, `lib/stream.js`, `lib/learningGrading.js` (new), `middleware/auth.middleware.js`, `middleware/rateLimit.middleware.js` (new), `middleware/errors.middleware.js` (new), `models/User.js`, `models/FriendRequest.js`, `models/QuizSession.js` (new), `controllers/auth.controller.js`, `controllers/user.controller.js`, `controllers/chat.controller.js`, `controllers/ai.controller.js`, `controllers/learning.controller.js`, `controllers/adminLearning.controller.js` (unchanged logic), `routes/auth.route.js`, `routes/user.route.js`, `routes/ai.route.js`, `routes/adminLearning.route.js`, `scripts/grantAdmin.js` (new), `tests/grading.test.js` (new), `tests/units.test.js` (new), `tests/http.test.js` (new), `tests/integration.test.js` (new), `package.json`, `package-lock.json`.

Frontend: `lib/axios.js`, `lib/api.js`, `lib/languageFlag.jsx` (new), `App.jsx`, `pages/NotificationsPage.jsx`, `pages/HomePage.jsx`, `pages/ChatPage.jsx`, `pages/learning/QuizPage.jsx`, `pages/learning/AssessmentPage.jsx`, `pages/learning/AssessmentResultPage.jsx`, `pages/learning/LearningProgressPage.jsx`, `components/FloatingChatBot.jsx`, `components/FriendCard.jsx`, `package.json`, `package-lock.json`.

---

## 1. Phase 1 findings (original audit) and current status

### 1.1 Security

| ID | Severity | Finding | Status |
|---|---|---|---|
| C1 | Critical | Any user can self-promote to admin (`claim-admin`) | **Fixed** |
| C2 | Critical | Recommendations return password hashes and emails | **Fixed** |
| C3 | Critical | Signup and login responses include the password hash | **Fixed** |
| C4 | Critical | Onboarding mass assignment (role, email, friends, password) | **Fixed** |
| C5 | Critical | Assessment cheating: client-chosen questions and denominator; answer key revealed | **Fixed** (see C5-b residual) |
| H1 | High | Practice quiz: same as C5 | **Fixed** |
| H2 | — | Assessment result ownership | **Not a bug** (owner filter present) |
| H3 | High | No rate limiting on auth/AI | **Fixed** (in-memory; H3-b) |
| H4 | High | Prompt injection in AI chat | **Mitigated** (content separated; rules in system instruction) |
| H5 | High | Invalid/expired token returns 503 | **Fixed** |
| M1 | Medium | Stream token never expires | **Fixed** |
| M2 | Medium | Lesson completion has no unlock check | **Partially fixed** (pair and level; no in-category prerequisite) |
| M4 | Medium | Any user can sync any Stream profile | **Fixed** |
| M5 | Medium | CORS hard-coded, ignores CLIENT_URL | **Fixed** |
| M6 | Low | Signup reveals account existence | Open (intentional; see §0.3) |
| M7 | Medium | No security headers | Open (H-helmet) |
| M8 | Medium | No server-side logout | Open |
| M9 | Medium | Friend accept not transactional | **Partially fixed** (guarded + rollback) |
| M10 | Medium | No unique index on FriendRequest | **Fixed** |

### 1.2 Runtime and logic

| ID | Severity | Finding | Status |
|---|---|---|---|
| R1 | High | Default Gemini model may be retired | **Open — needs live key** |
| R2 | High | Translation sends language names to MyMemory | **Fixed** |
| R3 | Medium | Bad token → 503 | **Fixed** (as H5) |
| R4 | Medium | Accept not idempotent-safe; no reject | **Fixed** (reject added) |
| R5 | Medium | `select-language` crashes on non-string | **Fixed** |
| R6 | Medium | `__dirname` depends on cwd | **Fixed** |
| R7 | Medium | Startup error message misleading | **Fixed** |
| R8 | Medium | Dev API URL hard-coded | **Fixed** |
| R9 | Low | `streamify` self-dependency | **Fixed** |
| R10 | Low | Missing Gemini key not reported clearly | **Fixed** |
| R11 | Low | Biased shuffle | **Fixed** |
| R12 | Low | Progress read-modify-write race | Open (session claim is atomic) |
| R13 | Low | Recommendations unbounded | **Fixed** |

### 1.3 Frontend

| ID | Severity | Finding | Status |
|---|---|---|---|
| F1 | High | 8 ESLint errors | **Fixed** (0 errors) |
| F2 | Medium | 2.3 MB bundle | Open |
| F3 | Low | Admin route auth-only on client | Open (server enforces) |
| F4 | Needs verification | Generic renderer for four question types | Open — needs browser pass |
| F5 | Needs verification | Stream client lifecycle | Open — needs credentials |

### 1.4 Data

| ID | Severity | Finding | Status |
|---|---|---|---|
| D1 | High | Default language pair `hi`/`mr` for everyone | Open (product decision; onboarding should set it explicitly) |
| D2 | Medium | Attempt records contain correct answers | Mitigated (only the owner can read their attempt) |
| D3 | Medium | FriendRequest missing unique index and rejected state | **Fixed** (index; reject removes the document) |
| D4 | Low | `password` minlength validates the hash | Open (plaintext length checked in controller) |
| D5 | Low | Learning index review | Reviewed; not load-tested |

### 1.5 Dependencies

| Package | Current | Latest | Status |
|---|---|---|---|
| `@google/generative-ai` | 0.12.0 | 0.24.1 | Open — deprecated upstream; migrate to `@google/genai` (needs live test) |
| `stream-chat` | 8.60.0 | 9.56.1 | Open — major upgrade; needs Stream credentials to verify |
| `express` | 4.21.2 | 5.3.0 | Open — major upgrade |
| `mongoose` | 8.16.1 | 9.13.0 | Open — major upgrade |
| `dotenv` | 16.6.1 | 18.0.10 | Open — major upgrade |
| `mongodb-memory-server` | — | 10.4.3 | **Added** (dev, for integration tests) |

Upgrades were deliberately not made in this pass: each major version needs its own test cycle, and the integration suite cannot run yet.

## 2. Root causes (summary)

1. **Trust in the client.** Grading, scoring denominators, and profile fields were taken from request bodies. Fixed by server sessions, whitelists, and server-side claims.
2. **Missing projections and serializer.** Sensitive fields were returned because nothing removed them. Fixed by the `toJSON` transform and explicit `select` lists.
3. **Test-only code in production routes.** `claim-admin` had no environment gate. Fixed by gating and an operator script.
4. **Catch-all error mapping.** Auth errors and provider errors were all 503. Fixed with specific mappings.
5. **Frontend drift.** Unused variables and missing features (reject) left lint and UX gaps. Fixed.


---

## 11. Phase 4 security and performance review

Scope: the whole application as it stands after Phase 4. Method: code inspection of every route and middleware, targeted greps for unsafe patterns, and the automated tests listed in TESTING_REPORT.md. No external penetration test was run.

### 11.1 Checklist results

| Area | Result | Evidence |
|---|---|---|
| Authentication | Pass with one open item | Passwords hashed with bcrypt (cost 10). Login returns the same message for unknown email and wrong password. Minimum signup password is now 8 characters. Open: no account lockout beyond the per-IP limit on login and signup. |
| JWT | Pass with one open item | HS256 pinned. Expired, tampered, and wrong-secret tokens return 401 (tests). Open: no server-side revocation; a stolen token works until it expires after 7 days. |
| Cookies | Pass | `httpOnly`, `sameSite=strict`, `secure` in production, cleared with the same attributes that set them (tests). |
| Authorization | Pass | Every admin route is behind `protectRoute` and `adminOnly` (tests cover non-admins on each new route). Vocabulary, reports, and quiz sessions are owner-scoped; other users' ids return 404. Suspended accounts are refused on every authenticated route (tests). |
| Self-promotion | Pass | `claim-admin` is 404 by default and cannot be enabled in production (tests). |
| CORS | Pass | Allow-list from `CLIENT_URL` plus localhost:5173. Credentials allowed only for listed origins. |
| CSRF | Pass with a note | `sameSite=strict` plus an Origin check on state-changing requests (6 tests). Requests without an Origin header are not blocked. This is deliberate; they are not browser CSRF vectors. |
| Input validation | Pass | New endpoints type-check every field. Content writes go through `contentValidation.js`. AI inputs are length-capped. JSON bodies are capped at 100 kB. |
| Rate limiting | Pass with open items | Login and signup: 30 per 15 minutes per IP. AI chat, grammar, explain, practice, and suggestions: 20 per minute per user. Translation: 60 per minute per user. Open: in-memory per process; not shared across instances. |
| Password security | Pass | Hashing at rest verified (test: stored value starts with `$2`). Hash never serialized (tests). |
| API key protection | Pass | No secrets in tracked source (scan). Stream secret and Gemini key are read on the server only. Frontend reads only `VITE_STREAM_API_KEY`, which is the public key. |
| Admin endpoint protection | Pass | See Authorization. Admin search escapes regex input (test with `(` and `$where`). |
| MongoDB injection | Pass | Query values come from typed fields. Admin search is escaped and length-capped. No `$where`, `eval`, or raw JavaScript from input (grep). Mongoose casts ids and rejects invalid ones with 400. |
| XSS | Pass | No `dangerouslySetInnerHTML` or `innerHTML` in the frontend (grep). AI output and user text render as React text. |
| CSP | **Open** | helmet's CSP is disabled because a generic policy would block Stream. A tuned policy is documented in DEPLOYMENT_GUIDE.md and must be added before production. |
| File uploads | Not applicable | The application has no upload endpoint. Avatar images are external URLs. |
| Sensitive data exposure | Pass with one note | Password hashes excluded from all responses. Admin user lists use a safe-field projection. Answer keys are hidden in deactivation responses and in practice and assessment questions before submission. Note: after a quiz is submitted, correct answers are shown for that quiz (existing behaviour). Admin content responses include the answer key, which is intended for administrators. |
| Error exposure | Pass | Unknown errors return generic messages. AI errors never include raw model output. Provider details are not returned. |

### 11.2 Findings fixed in Phase 4

| ID | Severity | Finding | Fix |
|---|---|---|---|
| P4-S1 | High | Suspended accounts could keep using their session | `protectRoute` refuses suspended accounts. Tested. |
| P4-S2 | Medium | No protection against cross-origin state-changing requests beyond SameSite | Origin check added. Tested. |
| P4-S3 | Medium | No security headers | `helmet` added (CSP left for a tuned policy). |
| P4-S4 | Medium | Admin search built an unescaped regex from input | Escaped and length-capped. Tested. |
| P4-S5 | Medium | Content writes accepted invalid answers and duplicates | Validators and duplicate checks. Tested. |
| P4-S6 | Low | AI replies could echo unvalidated model output and raw text on error | Strict JSON parsing; error responses carry no raw text. Tested. |
| P4-S7 | Low | AI rate limits were per IP, so shared networks shared a limit | Per authenticated user. |
| P4-S8 | Low | Minimum signup password of 6 characters | Raised to 8. |

### 11.3 Open security items (not fixed)

| ID | Severity | Item | Recommendation |
|---|---|---|---|
| P4-O1 | High before production | No Content Security Policy | Add a tuned CSP (see DEPLOYMENT_GUIDE.md §6) and test it in a browser. |
| P4-O2 | Medium | No server-side logout or token revocation | Add a token version on the user, or a denylist with TTL. |
| P4-O3 | Medium | Rate limits are in memory | Use a shared store (for example Redis) before running more than one instance. |
| P4-O4 | Medium | No account lockout after repeated failures | Add a progressive delay or a lockout with an admin reset. |
| P4-O5 | Low | 7-day token lifetime | Shorten, and add refresh tokens if sessions must be long. |
| P4-O6 | Low | Signup reveals whether an email exists (409) | Accepted for usability; a product decision. |

### 11.4 Performance review

| Area | Finding | Action |
|---|---|---|
| Recommendations | Loads blocked and blocker sets with an extra query; capped at 50 results | Acceptable. The block query uses the `blockedUsers` array. Add an index if block lists grow large. |
| Admin user search | Unanchored regex cannot use an index | Acceptable for the admin tool. Revisit above roughly 100,000 users. |
| Analytics (learner) | Loads all of a learner's attempts for the active pair | Acceptable per learner. Consider an aggregation or a cached summary when attempt counts reach the thousands. |
| Platform analytics (admin) | Several aggregations per request | Acceptable for occasional admin use. Cache if polled. |
| Translation | Cache and in-flight deduplication | Already in place (Phase 3). |
| Frontend | Large single bundle; goals card refetches on window focus | Code-split pages in a later pass. Refetch is cheap. |
| `lastSeenAt` | Written at most every 5 minutes per user, not awaited | Minimal write load. |

### 11.5 Test evidence

The security items above map to tests in `tests/integration.test.js` (suspension, admin gating, block and report rules, ownership, content validation, admin search escaping), `tests/origin.test.js`, `tests/http.test.js`, and `tests/phase4.unit.test.js`. Results are in TESTING_REPORT.md.


---

## 12. AI services unavailable and Stream translation button: root causes (latest repair)

### 12.1 "AI services unavailable"

Verified with a live diagnostic against the configured key. The key itself was not the problem: the key authenticated (model listing returned 200), and `backend/.env` loaded correctly through dotenv. The application requested `gemini-1.5-flash` (the code default), and Google returns `404 NOT_FOUND` for that model. Every AI call therefore failed. The controllers reported the failure as a generic `503 "AI service temporarily unavailable"`, which hid the cause.

Contributing faults:

1. The default model name was retired.
2. Failures were collapsed into one generic message, so the frontend could not say what was wrong.
3. Nothing checked the provider. A key being present looked like success.
4. Each controller created its own Gemini client, with separate error handling.

Fixes: a single `services/geminiService.js` (one client, configurable model, timeouts, typed error codes); an authenticated health endpoint with cached, real probes; a status badge that names the failure and rechecks every minute while unavailable; and a default model that answers. Live results after the fix are in TESTING_REPORT.md.

The exact text "AI Services Unavailable" does not appear anywhere in the repository. The closest real messages were the backend's "AI service temporarily unavailable" and the chat bot's error text. Those are now replaced by the specific status messages.

### 12.2 Missing Translate button in Stream messages

The root cause is in how stream-chat-react 12.15.7 renders a custom `Message` component. `Message.js` renders it as `<MessageUIComponent groupedByUser={...} />`. The only prop is `groupedByUser`; the message is supplied through `MessageContext`. `TranslatableMessage` read `props.message`, which was always undefined, so it never rendered the Translate control. `MessageSimple` reads the message from context too, so the message text itself still displayed.

Fix: read the message with `useMessageContext()`. Covered by component tests that supply the real `MessageProvider` context. Those tests check the component against the library's contract. They do not render the full Stream UI, which needs live credentials.

Other bugs found and fixed while testing the component:

- The panel followed the viewer's default target only, so a manual choice of another language was stored but not displayed. Fixed by tracking the chosen target per message.
- Retry and Translate shared one accessible name. Fixed.
- A video-call invitation (a text message containing `/call/`) would have been translated. Now skipped.
- The chat bot sent only the latest message and allowed duplicate submits. Now sends bounded history and ignores submits while a reply is pending.

### 12.3 Files changed in this repair

Backend: `services/geminiService.js` (new), `controllers/ai.controller.js`, `services/translation.service.js`, `services/aiTutor.service.js`, `routes/ai.route.js`, `lib/gemini.js` (deleted), `tests/gemini.unit.test.js` (new), `tests/integration.test.js` (health and error tests appended), `package.json` (helmet dependency already present; test scripts).

Frontend: `components/TranslatableMessage.jsx`, `components/AiStatusBadge.jsx` (new), `components/FloatingChatBot.jsx`, `pages/learning/AiToolsPage.jsx`, `store/useChatTranslationStore.js`, `lib/aiApi.js` (new), `components/__tests__/TranslatableMessage.test.jsx` (new), `src/test/setup.js` (new), `vite.config.js` (test configuration), `package.json` (test tooling).

Docs: `README.md`, `DEPLOYMENT_GUIDE.md`.
