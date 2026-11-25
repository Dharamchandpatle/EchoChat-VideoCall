# EchoChat — Implementation Roadmap (Phase 2 input)

Derived from the Phase 1 audit (PROJECT_ARCHITECTURE.md, PROJECT_FEATURES.md, BUG_AUDIT.md, DATABASE_ARCHITECTURE.md, API_DOCUMENTATION.md). Audit date: 2026-11-24.

Principles from the brief: no rewrite, keep routes and integrations, do not delete working functionality, inspect before editing.

## Before any change

1. **Commit the current working tree** (or create a branch). The entire learning system and ~14 modified files are uncommitted; a bad edit has no safe fallback today.
2. Add `npm test` (backend) that runs `src/tests/learningSystem.test.js`, and a frontend `lint` that passes, so regressions are visible.
3. Do **not** run destructive seeds against a shared database. The seeder upserts, but `LessonVocabulary` lacks a unique key.

## Phase 2A — Security fixes (do first; small, high value)

| # | Task | Files | Verification |
|---|---|---|---|
| 2A.1 | Remove or gate `POST /api/admin/learning/claim-admin` (C1) | `adminLearning.route.js`, `adminLearning.controller.js` | As non-admin, expect 404/403; admin routes still reachable by seeded admin |
| 2A.2 | Strip sensitive fields from all user responses: `select("-password -email")` on recommendations; toObject transform on `User` (C2, C3) | `user.controller.js`, `auth.controller.js`, `models/User.js` | Login/signup/recommendation JSON has no `password` |
| 2A.3 | Whitelist onboarding fields (C4) | `auth.controller.js` | Sending `role`/`email`/`friends` is ignored |
| 2A.4 | Fix `protectRoute` status codes: 401 on JWT errors, 503 only on DB errors (H5, R3) | `auth.middleware.js` | Expired cookie → 401; frontend session check behaves |
| 2A.5 | Add rate limits to auth and AI routes; `express.json({limit})` (H3) | `server.js`, `auth.route.js`, `ai.route.js` (add `express-rate-limit`) | 429 after threshold |

## Phase 2B — Learning integrity (core product correctness)

| # | Task | Files | Notes |
|---|---|---|---|
| 2B.1 | Server-side **assessment and quiz sessions**: persist served question IDs with an expiry when quizzes/assessments are fetched (C5, H1) | new `models/QuizSession.js`; `learning.controller.js` (`getPracticeQuiz`, `getLevelAssessment`, submit handlers); `routes/learning.route.js` (optional `sessionId` param) | Keep the response shape the frontend uses; add `sessionId` as an extra field |
| 2B.2 | Grade only session questions; denominator = session question count; reject unknown/duplicate IDs | same | Old clients without session → 400 with clear message |
| 2B.3 | Stop returning `correctAnswer`/`explanation` until the attempt is finished or per-question after submit | `learning.controller.js` feedback builders | Check QuizPage/AssessmentPage expect fields; the UI may show answers after each question — confirm before removing |
| 2B.4 | Keep the owner filter on `getAssessmentResult` intact during refactors (H2, already enforced) | `learning.controller.js` | Other user's attemptId → 404 |
| 2B.5 | Prerequisite check on `completeLesson` (M2) | `learning.controller.js` | Locked category/level → 403 |
| 2B.6 | Make progress updates atomic (`$set`/`$inc` or versioned saves) (R12) | `learning.controller.js` | Concurrent submits don't lose stars |

## Phase 2C — Social and identity

| # | Task | Files |
|---|---|---|
| 2C.1 | Friend acceptance: require `pending`; wrap writes in a transaction (or a single guarded update) (R4, M9) | `user.controller.js` |
| 2C.2 | Add **reject** and **cancel** endpoints + UI buttons on NotificationsPage (missing feature) | `user.route.js`, `user.controller.js`, `frontend/src/pages/NotificationsPage.jsx`, `lib/api.js` |
| 2C.3 | Unique index `{sender, recipient}` on FriendRequest; add `rejected` status if used (M10, D3) | `models/FriendRequest.js` |
| 2C.4 | Profile edit endpoint and page (missing feature) | `auth.route.js`/new route, `OnboardingPage` reuse |
| 2C.5 | Restrict `POST /chat/user/:id` to self (or admin) (M4) | `chat.controller.js` |

## Phase 2D — AI and translation

| # | Task | Files |
|---|---|---|
| 2D.1 | Verify and set current Gemini model; add startup check for key and model (R1, R10) | `ai.controller.js`, `.env` (document in README) |
| 2D.2 | Migrate `@google/generative-ai` → `@google/genai` (deprecated package) | `ai.controller.js`, `backend/package.json` |
| 2D.3 | Send ISO codes from the chat store; keep names for display only (R2) | `useChatTranslationStore.js`, `TranslatableMessage.jsx`, `FloatingChatBot.jsx` |
| 2D.4 | Move user text out of the system prompt; validate `language` (H4) | `ai.controller.js` |
| 2D.5 | Either wire `/ai/detect-language` into the UI or remove it from the docs | frontend chat components |

## Phase 2E — Learning content and admin

| # | Task | Notes |
|---|---|---|
| 2E.1 | Admin UI for languages, categories, lessons, questions (currently API-only) | Build on existing `AdminLearningPage` tabs; keep stats/seeder tabs |
| 2E.2 | Content for at least one more language pair, or clearly label others "Coming soon" in `LanguageSelectionPage` | Only hi→mr is seeded today |
| 2E.3 | Verify the four non-custom question types render correctly (F4) | Manual QA in browser |
| 2E.4 | Unique index on `LessonVocabulary {lesson, sourceText}` (DB §5) | Check existing duplicates first |
| 2E.5 | Consolidate admin stats into an aggregation | Optional, performance |

## Phase 2F — Frontend quality and build

| # | Task | Files |
|---|---|---|
| 2F.1 | Fix the 8 ESLint `no-unused-vars` errors (F1) | `AssessmentPage.jsx`, `AssessmentResultPage.jsx`, `LearningProgressPage.jsx`, `QuizPage.jsx`, plus 3 others found by `npx eslint .` |
| 2F.2 | Code-split learning pages and Stream SDKs with `React.lazy` (F2) | `App.jsx` |
| 2F.3 | Make dev API base URL configurable (`VITE_API_URL`) (R8) | `lib/axios.js` |
| 2F.4 | Resolve duplicate routers (`react-router` and `react-router-dom`) | `package.json` |
| 2F.5 | Remove `"streamify": "file:.."` from both package.json files (R9) | `backend/package.json`, `frontend/package.json` |
| 2F.6 | Consider `CLIENT_URL`-driven CORS (M5) | `server.js` |

## Phase 2G — Platform hygiene and dependencies

| # | Task | Notes |
|---|---|---|
| 2G.1 | Add `npm test` for backend; add a real integration test with `mongodb-memory-server` and mocked Stream/Gemini for the security fixes | Protects 2A–2B |
| 2G.2 | Add a JSON 404 handler and a `/health` endpoint | Low risk |
| 2G.3 | Fix `__dirname` usage (`fileURLToPath`) (R6) and clarify startup error messages (R7) | `server.js` |
| 2G.4 | Add `helmet`, enforce JWT expiry on Stream tokens (M1, M7) | `lib/stream.js`, `server.js` |
| 2G.5 | Upgrades, one major at a time: express 5, mongoose 9, stream-chat 9 (see BUG_AUDIT §5) | Each as its own commit with the test suite green |
| 2G.6 | Code-split the 2.3 MB frontend bundle (F2) | Measure before and after |
| 2G.7 | Add CI (lint, build, tests) | None exists |

## Recommended order

1. Commit baseline (Before any change).
2. **2A** security fixes — they are small and remove privilege escalation and credential leaks.
3. **2B.1–2B.4** assessment integrity — the cheat path is the most serious product defect in the learning system.
4. **2F.1** lint fixes — unblocks CI.
5. **2C.1–2C.3** friend flow and reject feature.
6. **2D** AI model and translation codes.
7. **2E** content and admin UI.
8. **2G** hygiene and upgrades.

## Verification checklist for each phase

- Backend: `node --check` on changed files; `node src/tests/learningSystem.test.js` passes; a manual run against a dev DB.
- Frontend: `npx vite build` succeeds; `npx eslint .` passes (after 2F.1); manual walk through the changed screen.
- Security items: explicit before/after requests (curl with cookie) recorded in the PR description.
- Keep README.md in sync for any new env var (`GEMINI_MODEL`, `ADMIN_EMAIL`, `VITE_API_URL`, rate-limit settings).

## Explicitly out of scope for these phases

- Replacing Stream, Gemini, MyMemory, MongoDB, React, or Express.
- Visual redesigns.
- Deleting any model or route without a dependency check (none is recommended for deletion; `claim-admin` is the only proposed removal).
