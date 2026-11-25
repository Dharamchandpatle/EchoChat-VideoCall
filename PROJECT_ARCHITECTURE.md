# EchoChat — Project Architecture

Audit date: 2026-11-24 · Scope: Phase 1 inspection of the working tree (committed + uncommitted).

## 1. Repository layout

```
EchoChat/
├─ package.json            # root scripts: build (installs + builds both), start (backend)
├─ README.md               # existing project README (not modified in this phase)
├─ backend/                # Express + Mongoose API (ESM, "type": "module")
│  ├─ src/server.js        # app bootstrap, CORS, route mounting, DB connect, seed check
│  ├─ src/lib/             # db.js, stream.js, learning seed data + content
│  ├─ src/middleware/      # auth.middleware.js (protectRoute, adminOnly)
│  ├─ src/models/          # 13 Mongoose models (see DATABASE_ARCHITECTURE.md)
│  ├─ src/controllers/     # auth, user, chat, ai, learning, adminLearning
│  ├─ src/routes/          # 6 route files mounted under /api/*
│  ├─ src/services/        # learningSeeder.service.js
│  ├─ src/scripts/         # syncStreamUsers.js (npm run sync:stream-users)
│  └─ src/tests/           # learningSystem.test.js (plain Node script, not a test runner)
├─ frontend/               # React 19 + Vite SPA
│  ├─ src/App.jsx          # all client routes + auth/onboarding gating
│  ├─ src/pages/           # social/chat/call pages + pages/learning/* (8 learning pages)
│  ├─ src/components/      # shared UI + learning/ (3 interactive question components)
│  ├─ src/lib/             # axios.js, api.js, learningApi.js, streamClientManager.js, speech.js
│  ├─ src/store/           # Zustand stores (theme, chat translation)
│  └─ src/hooks/           # useAuthUser, uselogin, useSignUp, useLogout (file names as on disk)
└─ output/, tmp/           # report/synopsis build artifacts (untracked, not application code)
```

### Git state (important for Phase 2)
- Only the original baseline is committed. The **entire learning system is untracked** (`backend/src/controllers/learning*`, `backend/src/models/*` for learning, `frontend/src/pages/learning/`, etc.) and ~14 tracked files carry uncommitted edits.
- Nothing in the learning system is protected by version history yet. Commit or stash before risky Phase 2 changes.
- `backend/.env` and root `.env` exist and are ignored by `.gitignore` (not tracked). Good.

## 2. Runtime architecture

```
 Browser (React SPA, :5173 in dev)
   │  axios (withCredentials)  ── dev: http://localhost:5001/api   prod: /api
   │  Stream Chat WS/HTTP  (VITE_STREAM_API_KEY, public key)
   │  Stream Video SDK    (token from /api/chat/token)
   ▼
 Express API (:5001)  ── cookie "jwt" (httpOnly, sameSite=strict, 7d)
   │  protectRoute → User.findById
   │  ├─ MongoDB (Mongoose)           users, friends, learning, quiz, rewards
   │  ├─ Stream Server SDK           upsertUsers, createToken
   │  ├─ Google Gemini (@google/generative-ai)   chat, translate, detect
   │  └─ MyMemory HTTP API (fetch)   translation fallback (no key)
   ▼
 MongoDB (MONGO_URI)
```

- **Production:** when `NODE_ENV=production`, Express serves `../frontend/dist` and falls back to `index.html` for every non-API route (SPA). Single origin, so cookies work without CORS.
- **Development:** Vite on :5173; API on :5001. CORS is hard-coded to `http://localhost:5173` with `credentials: true` (ignores `CLIENT_URL`).

## 3. Startup sequence (`backend/src/server.js`)

1. Load `dotenv/config` (imported before routes, so `GEMINI_API_KEY` is available when `ai.controller.js` loads).
2. Register CORS, JSON body parser (no size limit set), cookie-parser.
3. Mount `/api/auth`, `/api/users`, `/api/chat`, `/api/ai`, `/api/learning`, `/api/admin/learning`.
4. `connectDB()`; on failure logs and exits with code 1 **without** starting the HTTP listener.
5. If `Language` collection is empty → `seedLearningDatabase()` (non-fatal on error).
6. `app.listen(PORT)`.

`lib/stream.js` builds a `StreamChat` server client at import time; missing keys only log an error, and every call then throws.

## 4. Authentication and authorization model

| Concern | Implementation | Status |
|---|---|---|
| Credential storage | bcryptjs (cost 10) in `User` pre-save hook | Working |
| Session | JWT (HS256 via `JWT_SECRET_KEY`, 7d) in httpOnly cookie `jwt` | Working, but see BUG_AUDIT |
| Cookie flags | `sameSite: strict`; `secure` only when NODE_ENV=production | Acceptable for current setup |
| Route guard (API) | `protectRoute` on every non-public route | Working |
| Admin guard | `adminOnly`: `role === "admin"` OR email equals `ADMIN_EMAIL` | **Broken** — any user can self-promote via `/api/admin/learning/claim-admin` |
| Client guard | `App.jsx` gates routes on `authUser` and `isOnboarded`; `/admin/learning` is only auth-gated on the client | Working (UX only; server enforces) |
| Rate limiting | None on `/auth/*`, `/ai/*` | Missing |

## 5. Frontend architecture

- **Routing:** React Router v7 (`react-router-dom`). Session state comes from a single React Query call to `GET /api/auth/me` (`useAuthUser`). Redirect logic lives in `App.jsx`: unauthenticated → `/login`; authenticated but not onboarded → `/onboarding`.
- **Server state:** TanStack React Query for `authUser`, friends, recommendations, and learning data.
- **Client state:** Zustand — `useThemeStore` (persisted theme) and `useChatTranslationStore` (target language and auto-translate, persisted in `localStorage`).
- **Chat/Video:** `streamClientManager.js` is a singleton Stream Chat client with a connect guard. `ChatPage` and `CallPage` each create their own Stream client via the `stream-chat-react` / `@stream-io/video-react-sdk` providers.
- **Learning UI:** `pages/learning/*` plus `components/learning/*` (MatchQuestion, ArrangeWordsQuestion, StarCelebration). Speech output in `lib/speech.js` uses the browser Speech Synthesis API.
- **Build:** Vite 6 + Tailwind 3 + DaisyUI 5. Production build passes; one 2.3 MB JS chunk (660 kB gzip) triggers a size warning.

## 6. Learning subsystem architecture

- **Content model:** `Language` (21 active Indian languages) → `LearningCategory` (15 topics; level easy/medium/hard) → `Lesson` (per source/target language pair + category + level) → `LessonVocabulary`.
- **Assessments:** `QuizQuestion` (7 types; `isAssessment` flag) is served as sanitized random subsets by `getPracticeQuiz` (10 questions) and `getLevelAssessment` (Easy 10 / Medium 15 / Hard 20).
- **Progress:** `UserLanguageProgress` per (user, native, target) holds `unlockedLevels`, `levelBestScores`, `levelStars`, `totalStars`, `streak`. `UserLessonProgress`, `QuizAttempt`, `UserReward`, `UserAchievement` record history.
- **Scoring rules:** 60% passes; stars table in `calculateStarsForScore` (≥95→5, ≥80→3, ≥60→2, ≥40→1); passing Easy unlocks Medium, Medium unlocks Hard; streak is calendar-day based.
- **Content coverage:** Only **Hindi → Marathi** has lessons, vocabulary, practice questions, and assessments (seeded from `lib/hindiMarathiLessons.js` and `lib/hindiMarathiQuestions.js`). The other 20 languages are configured but have no content.

## 7. External integrations

| Service | Used for | Configuration | Notes |
|---|---|---|---|
| MongoDB | All persistence | `MONGO_URI` | `serverSelectionTimeoutMS: 5000`; no reconnect handlers |
| Stream Chat | Messaging, user sync, video tokens | `STREAM_API_KEY`, `STREAM_API_SECRET` (server); `VITE_STREAM_API_KEY` (client, public key) | Token TTL not set (no expiry) |
| Stream Video | Video calling | Same keys; token from `/api/chat/token` | Needs runtime verification |
| Google Gemini | Chat, translate, detect | `GEMINI_API_KEY`, optional `GEMINI_MODEL` (default `gemini-1.5-flash`) | Default model may be retired — see BUG_AUDIT |
| MyMemory | Translation fallback | none (public API) | Receives language *names* from the chat store — see BUG_AUDIT |
| DiceBear | Random avatar URL on signup | none | External image URL stored on user |

## 8. Environment variables (names only)

Backend: `PORT`, `MONGO_URI`, `STREAM_API_KEY`, `STREAM_API_SECRET`, `JWT_SECRET_KEY`, `CLIENT_URL` (currently unused by CORS), `GEMINI_API_KEY`, `GEMINI_MODEL` (optional), `NODE_ENV`, `ADMIN_EMAIL` (optional; referenced by `adminOnly` but not set in the local env).
Frontend: `VITE_STREAM_API_KEY`; `MODE` selects the dev API base URL (hard-coded port 5001).

No secrets are present in tracked source. Secrets live only in gitignored `.env` files.

## 9. Dependency and toolchain snapshot

- Node/npm: backend and frontend use separate `node_modules`; both are installed.
- Backend: `express 4.21.2`, `mongoose 8.16.1`, `stream-chat 8.60.0`, `@google/generative-ai 0.12.0`, `dotenv 16.6.1`, `jsonwebtoken 9.0.2`, `bcryptjs 3.0.2`.
- Frontend: `react 19`, `vite 6.3.5`, `tailwindcss 3.4`, `daisyui 5.0.43`, `stream-chat-react 12.x`, `@stream-io/video-react-sdk 1.18.x`.
- Both `package.json` files declare `"streamify": "file:.."` — a self-referential local dependency to the root package. It is meaningless at runtime and should be removed (see BUG_AUDIT).
- Full outdated list: see BUG_AUDIT.md §5.

---

## Phase 4 additions

**New backend modules**

- `lib/contentValidation.js`: pure validation for questions, lessons, and languages.
- `lib/learningInsights.js`: goals, streak risk, analytics summary, weakest topics, incorrect-answer collection.
- `lib/shuffle.js`: unbiased shuffle (replaces the sort-based shuffle in new code).
- `middleware/origin.middleware.js`: cross-origin rejection for state-changing requests.
- `controllers/moderation.controller.js`: block, unblock, report, remove friend.
- `controllers/learningPlus.controller.js`: vocabulary book, goals, analytics, revision.
- `controllers/aiTutor.controller.js` and `services/aiTutor.service.js`: grammar, word explanation, practice, suggestions.
- `controllers/adminContent.controller.js`: validated content management.
- `controllers/adminManagement.controller.js`: users, activity, suspension, reports, platform analytics.
- Models: `SavedWord`, `UserReport`. Changed: `User`.

**Request path additions**

`helmet` → `express.json` (100 kB) → `/api` origin check → routes. `protectRoute` now rejects suspended accounts and updates `lastSeenAt` at most every 5 minutes. AI routes are limited per user; translation has its own, higher limit.

**Frontend additions**

- `pages/learning/VocabularyPage.jsx` and `pages/learning/AiToolsPage.jsx`, behind the same auth and onboarding guard as other learning pages.
- `components/learning/DailyGoalsCard.jsx`, shown on the learning dashboard.
- `components/FriendSafetyMenu.jsx`, a friend-card menu with remove, block, and report.
- `lib/learnPlusApi.js`: API client for the new endpoints.

**Not present (by design)**

- Admin UI for users, reports, and analytics. The endpoints exist; the admin page still has only Stats and Seeder tabs.
- Notification delivery. Stream notifications are not wired.
