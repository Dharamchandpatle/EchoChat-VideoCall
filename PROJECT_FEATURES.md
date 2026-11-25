# EchoChat — Feature Status (after Phase 2 repair)

Updated: 2026-11-24, after the Phase 2 repair pass. See `BUG_AUDIT.md` §0 for the full report.

**Status legend**
- **Working (tested)**: covered by an automated test that ran and passed.
- **Working (code-verified)**: wired end to end and reviewed, but not executed against a live database or external service here.
- **Partially Working**: works with a known gap (noted).
- **Needs Verification**: depends on a live service or browser session not available in this environment.
- **Not Implemented**: no code.

Test coverage legend: `U` = unit (`npm run test:unit`, 32 passing), `I` = database integration (`npm test`, 30 passing), `S` = seed test (passing), `B` = frontend build/lint (passing).

---

## 1. Authentication

| Feature | Endpoint / screen | Status | Evidence / notes |
|---|---|---|---|
| Signup | `POST /api/auth/signup` · SignUpPage | Working (code-verified) · `U`(validation), `I`(duplicate, hash at rest) | Returns sanitized user; 409 on duplicate (case-insensitive); bcrypt-hashed. |
| Login | `POST /api/auth/login` · LoginPage | Working (code-verified) · `I`(same 401 for unknown email and wrong password) | Rate-limited: 30 / 15 min / IP. |
| Logout | `POST /api/auth/logout` | Working (`U`) | Clears cookie with the same attributes it was set with. No server-side revocation (M8). |
| JWT | `middleware/auth.middleware.js` | Working (`U`) | HS256 pinned; tampered, forged, and expired tokens → 401. |
| HTTP-only cookie | `controllers/auth.controller.js` | Working (`U`) | `httpOnly`, `sameSite=strict`, `secure` in production. |
| Session persistence after refresh | `GET /api/auth/me` · `useAuthUser` | Working (`I`) | Cookie-based; `/me` returns the user without the password. |
| Session expiry in the UI | axios interceptor → `App.jsx` | Working (code-verified) | Any 401 re-checks `/auth/me`, so the user is routed to login. |
| Protected backend routes | `protectRoute` | Working (`U`, HTTP tests) | Every protected route returns 401 anonymously (HTTP test). |
| Protected frontend routes | `App.jsx` | Working (code-verified) | Redirect to login or onboarding. |
| Onboarding | `POST /api/auth/onboarding` · OnboardingPage | Working (`I`) | Whitelisted fields; role and email cannot be set. |
| Profile update | `PATCH /api/auth/profile` | Partially Working (`I` not written for it) | API exists and is validated; **no UI**. |
| Duplicate email | signup | Working (`I`) | 409 with a clear message. |
| Password reset, email verification | — | Not Implemented | |

## 2. Social networking

| Feature | Endpoint / screen | Status | Evidence / notes |
|---|---|---|---|
| Recommended users | `GET /api/users` · HomePage | Working (`I`) | Public fields only; excludes self, friends and pending-request users; limit 50. |
| Send friend request | `POST /api/users/friend-request/:id` | Working (`I`) | Self-request, duplicate (either direction), already-friends prevented; unique index. |
| Incoming requests | `GET /api/users/friend-requests` · NotificationsPage | Working (`I`) | |
| Outgoing requests | `GET /api/users/outgoing-friend-requests` | Working (`I`) | |
| Accept request | `PUT .../accept` | Working (`I`) | Recipient only; pending only (409 otherwise); friendship recorded once. |
| Reject request | `PUT .../reject` · NotificationsPage "Decline" | Working (`I`, UI built) | Removes the request so either side can re-send. |
| Cancel request | `DELETE /api/users/friend-request/:id` | Working (`I`) | Sender only. No UI button yet. |
| Friends list | `GET /api/users/friends` | Working (`I`) | Both sides see the friendship. |
| Unfriend / block | — | Not Implemented | |
| User search | — | Not Implemented | Only the recommendation list exists. |

## 3. Real-time chat (Stream Chat)

| Feature | Location | Status | Evidence / notes |
|---|---|---|---|
| Stream token | `GET /api/chat/token` | Working (code-verified, failure path `U`/`I`) | 24-hour expiry. Returns 503 when Stream is not configured. **Live token not verified.** |
| Stream user sync | `POST /api/chat/user/:id` | Working (code-verified) · `I`(authorization) | Self, friends, or admin only. |
| Stream server config | `lib/stream.js` | Working (code-verified) | Secret only on the server. Client uses the public key. |
| One-to-one channel creation | ChatPage | Needs Verification | Requires live Stream. |
| Message delivery and history | ChatPage (stream-chat-react) | Needs Verification | Requires live Stream. |
| Reconnection and disconnection | `streamClientManager.js` | Needs Verification | Singleton guards user switching; behavior on network drop not tested. |
| Chat invitations | — | Not Implemented | |
| Translate a message (incoming and outgoing) | `TranslatableMessage` → `POST /api/ai/translate` | Working (code-verified; API `I`-tested with mocked providers) | Translate button plus dropdown for native, learning, or another language. Show original / show translation toggle. Translation is local view state; the Stream message is never changed or re-sent. **Live Stream rendering not verified.** |
| Automatic translation | `PATCH /api/auth/translation-preferences` | Working (`I`) | Stored per user in MongoDB. Incoming text only. Each message translated once per target language. Failures stay silent with a retry control. |
| Translation settings | `TranslationSettingsModal` (ChatPage toolbar) | Working (code-verified, build `B`) | Native language, learning language, translation target (native / learning / another), automatic translation, display mode. Each saves independently. |
| Translation cache | `TranslationCache` (MongoDB, 30-day TTL) | Working (`I`) | Shared across both participants; identical concurrent requests share one provider call. |

## 4. Video calling (Stream Video)

| Feature | Location | Status | Evidence / notes |
|---|---|---|---|
| Start video call from chat | CallButton → `/call/:id` | Needs Verification | |
| Join call | CallPage | Needs Verification | Requires live Stream and camera/mic permission. |
| Call invitations and ringing | — | Not Implemented | Users share the call link. |
| Video permissions | browser prompt | Needs Verification | |
| Route guard | `/call/:id` | Partially Working | Login and onboarding required. Participant check not verified. |

## 5. AI features (Gemini and MyMemory)

| Feature | Endpoint / screen | Status | Evidence / notes |
|---|---|---|---|
| AI chat | `POST /api/ai/chat` · FloatingChatBot | Partially Working | Validated input (≤2000 chars); instructions in system prompt; rate-limited. Returns 503 without a key. **Live response not verified.** Default model may be retired (R1). |
| Text translation | `POST /api/ai/translate` | Partially Working | Accepts names or codes. Gemini first, MyMemory fallback (error bodies treated as failure). **Live not verified.** |
| Language detection | `POST /api/ai/detect-language` | Partially Working | Returns `languageCode` and `languageName`. No frontend caller yet. **Live not verified.** |
| Missing or revoked key | all AI endpoints | Working (`I`) | 503 with a clear message; no crash. |
| Rate limit | `/api/ai/*` | Working (`U`) | 20 requests / minute / IP; 429 with `Retry-After`. |
| MyMemory fallback | `fetch` | Needs Verification | Mapping and error-body detection unit-tested via helpers; live call not made. |

## 6. Indian-language learning

| Feature | Endpoint / screen | Status | Evidence / notes |
|---|---|---|---|
| Language catalogue (21) | `GET /api/learning/languages` | Working (`S`) | Seed data validated. |
| Native and target selection | `POST /api/learning/select-language` · LanguageSelectionPage | Working (`I`) | Validates types, active languages, and distinct pair; 400 on bad input. |
| Learning dashboard | `GET /api/learning/dashboard` | Working (code-verified) | |
| Categories (15) | `GET /api/learning/categories` | Working (`S`) | |
| Lessons | `GET /lessons/:categoryId`, `POST /lessons/:id/complete` | Partially Working (`I`) | Completion requires an active-pair, unlocked-level lesson. Content exists for **Hindi → Marathi only**. No intra-category prerequisite. |
| Vocabulary and grammar notes | LessonPage | Working (code-verified, `S` data) | Hindi → Marathi. |
| Speech synthesis | `lib/speech.js` | Needs Verification | Browser Speech Synthesis; voice availability varies. |
| Quiz generation | `GET /api/learning/quiz/:categoryId` | Working (`I`) | Issues a session; answers stripped; 404 when no questions. |
| Seven quiz formats | QuizPage / AssessmentPage | Partially Working | Server grades all seven; the frontend has dedicated renderers for three (`listen_identify`, `match`, `arrange_words`) and a generic one for the rest. Browser verification not done. |
| Quiz submission | `POST /api/learning/quiz/submit` | Working (`I`, `U`) | Requires `sessionId`; single use; 409 on duplicate; 410 when expired; session-only questions. |
| Score calculation | `lib/learningGrading.js` | Working (`U` × 10 scoring cases) | Denominator = session size; unanswered = incorrect. |
| Assessment generation | `GET /api/learning/assessment/:level` | Working (`I`) | Enforces unlock (403); 404 when no questions. Session issued. |
| Assessment submission | `POST /api/learning/assessment/submit` | Working (`I`) | Server-side grade, stars, unlock; single use; another user's session → 404. |
| Passing criteria | server | Working (`I`) | 60% passes; 60%+ unlocks the next level. |
| Level unlocking | server | Working (`I`) | Easy → Medium → Hard. |
| Star calculation | `calculateStarsForScore` | Working (`U`-tested formula; `I` award path) | Only the improvement over the previous best is awarded. |
| Achievements | `checkAndAwardAchievements` | Working (code-verified) | Unique index prevents duplicates. |
| Daily and longest streaks | `applyStreakUpdate` | Working (code-verified; formula in `S`) | Calendar-day based. |
| User progress | `GET /api/learning/progress` | Working (code-verified) | |
| Assessment result | `GET /api/learning/assessment-result/:id` | Working (code-verified) | Owner-only (404 for others). |

## 7. Admin

| Feature | Endpoint / screen | Status | Evidence / notes |
|---|---|---|---|
| Admin authorization | `adminOnly` | Working (`I`) | Non-admin → 403 on every admin route. |
| Self-promotion | `POST /api/admin/learning/claim-admin` | Working (`I`) | Returns **404 by default**; enabled only outside production with `ALLOW_SELF_ADMIN_CLAIM=true`. |
| Admin provisioning | `npm run admin:grant -- <email>` | Working (code-verified) | Operator script; not executed against a live DB. |
| Learning statistics | `GET /api/admin/learning/stats` | Working (`I`) | |
| Database seeding | `POST /api/admin/learning/seed` · Seeder tab | Working (code-verified) | Idempotent upserts. |
| Language create and update | `POST /api/admin/learning/languages` | Working (`I` admin gate; code-verified write) | API only; no UI. |
| Category create and update | `POST /api/admin/learning/categories` | Working (code-verified) | API only. |
| Lesson create and update | `POST /api/admin/learning/lessons` | Working (code-verified) | API only. |
| Question create and update | `POST /api/admin/learning/questions` | Working (code-verified) | API only. |
| Admin UI for content | AdminLearningPage | Partially Working | Only Stats and Seeder tabs. |

## 8. Platform

| Area | Status | Evidence / notes |
|---|---|---|
| Backend startup with MongoDB | Working (code-verified) · failure path verified | Without a DB: logs cause, exits 1. With a DB: **not run here**. |
| Health endpoint | Working (`U`/`HTTP`) | `GET /api/health`. |
| JSON errors everywhere under `/api` | Working (`HTTP`) | 404, 400 malformed, 413 too large. |
| CORS | Working (code-verified) | Allow-list from `CLIENT_URL` plus localhost:5173. |
| Frontend lint | Working (`B`) | 0 errors. |
| Frontend production build | Working (`B`) | Chunk-size warning (F2). |
| Security headers (helmet) | Not Implemented | |
| Test scripts | Working | `npm run test:unit` (32 pass), `npm run test:seed` (pass), `npm test` (62 passing, including integration against in-memory MongoDB). |
| CI | Not Implemented | |

---

## Test totals at the end of Phase 2

| Suite | Count | Result |
|---|---|---|
| Unit (`grading`, `units`) | 19 | Pass |
| HTTP against the real Express app | 13 | Pass |
| Database integration (real MongoDB 7.0.24) | 30 | Pass |
| Seed content | 7 checks | Pass |
| Frontend lint | — | 0 errors |
| Frontend build | — | Pass |

---

## 9. Chat translation (Phase 3)

| Requirement | Status | Evidence |
|---|---|---|
| Both users translate independently | Working (API) · Needs Verification (live Stream) | Per-user preferences (`I`); per-message state is local. Two users with different targets get different results from the same cache entry (`I`). |
| Native and learning language kept separate | Working (`I`) | Changing native language keeps learning language and custom target (`I`). |
| Automatic translation per user | Working (`I`) | Preference stored per user (`I`). UI behaviour: needs live check. |
| Translate button on every text message, incoming and outgoing | Working (code-verified, build `B`) | `TranslatableMessage`. Skips attachments, system, and deleted messages. |
| Show original / hide translation | Working (code-verified) | Toggle in `TranslatableMessage`. |
| Does not modify or re-send messages | Working (code-verified) | Translation is local state; `MessageSimple` renders the untouched message. |
| Gemini primary, MyMemory fallback | Working (`I` with mocked providers) · Needs Verification (live) | `translation.service.js`. Gemini 429 falls back to MyMemory (`I`). |
| Meaningful errors, no credential leakage | Working (`I`) | 400 codes, 429 `RATE_LIMITED`, 503 `PROVIDERS_UNAVAILABLE` with no provider details. |
| Caching and duplicate-request prevention | Working (`I`) | Simultaneous identical requests → 1 provider call (`I`). Failures not cached (`I`). |
| Empty, long, same-language messages | Working (`U`, `I`) | Validation and same-language short-circuit tested. |
| Emojis and special characters | Needs Verification | Passed through as text; live Gemini output not tested. |
| Hindi ↔ Marathi, English ↔ Hindi, and other pairs | Needs Verification (live) | Language list and mapping tested (`U`). Live translation quality not tested. |
| Channel switching, message history, video invites | Needs Verification (live Stream) | No change to Stream channel or send logic; not run live. |

**Test results (Phase 3):** backend `npm test` 88 / 88 pass (`U` 32 + translation unit 13 + `I` 43). Frontend lint 0 errors; production build passes. Manual two-browser scenarios A–D from the brief were **not run**: they need live Stream credentials and two signed-in accounts.


---

## 10. Phase 4 status (advanced features, security, readiness)

Status legend: **Done (tested)** means automated tests cover it. **Done (API only)** means the endpoint works and is tested, but the UI is missing or not browser-tested. **Partial** means part of the request is built. **Not implemented** means no code. **Blocked** means it needs an external service or credential this environment does not have.

### 10.1 AI language learning assistant

| Feature | Status | Evidence and limits |
|---|---|---|
| AI conversation practice (native and learning language, Beginner/Intermediate/Advanced, real-life scenarios) | Done (API only) | `POST /api/ai/practice`, tested with a mocked model. UI: "Conversation practice" panel on the AI tools page. Live reply quality not verified. |
| Grammar correction (corrected sentence, explanation, natural alternative) | Done (API only) | `POST /api/ai/grammar`, tested with a mocked model. UI: "Grammar check" panel. |
| Smart vocabulary: meaning, usage, examples | Done (API only) | `POST /api/ai/explain-word`. UI: "Word explainer" panel. |
| Smart vocabulary: save words | Done (tested) | Save from the explainer or the vocabulary book. |
| Smart chat replies in the learning language | Done (API only) | `POST /api/ai/suggest-replies`. Suggestions are returned only. **Inserting a suggestion into the chat input is not implemented**: stream-chat-react's composer API was not wired or verified against a live channel. |

### 10.2 Personalized learning

| Feature | Status | Evidence and limits |
|---|---|---|
| Daily learning target (lessons and quizzes) | Done (tested) | `GET/PATCH /api/learning/goals*`. UI: goals card on the learning dashboard. |
| Daily completed lessons and quiz completion tracking | Done (tested) | Computed from completion and attempt timestamps in UTC. |
| Learning streak reminders | Partial | Streak-at-risk message shown on the dashboard. **No push, email, or scheduled reminders**: none exist in the app. |
| Vocabulary book: save, meanings, examples, mark learned, review | Done (tested) | `/api/learning/vocabulary*`. UI: Vocabulary book page. Duplicates are rejected per language. |
| Revision: review completed lessons | Done (API only) | `GET /revision/lessons`. No UI page of its own. |
| Revision: practise weak topics | Done (API only) | `GET /revision/weak-topics`. No UI. |
| Revision quizzes | Done (tested) | `POST /revision/quiz`, graded through the same session flow. Revision UI not built. |
| Track incorrect answers | Done (tested) | Derived from stored quiz attempts; no separate model. |
| Learning analytics: lessons, accuracy, streaks, progress by category | Done (API only) | `GET /learning/analytics`. The Progress page was not changed to show it. |
| Time spent learning | Partial | Only quiz time is measured. Lesson reading time is not tracked, and the response says so. |
| Language proficiency progress | Partial | Facts only: unlocked levels, stars, best score per level. **No proficiency score**, since no methodology is defined. |

### 10.3 Pronunciation and speech

| Feature | Status | Evidence and limits |
|---|---|---|
| Listen to vocabulary and example sentences | Done (code-verified) | Browser Speech Synthesis via the existing `lib/speech.js`. Not verified in a browser. |
| Language-aware voice selection | Partial | Uses the existing BCP-47 map. Depends on voices installed on the device. |
| Playback controls (rate, pause, stop) | Not implemented | Only the existing cancel-and-speak behaviour. |
| Repeat and practise | Not implemented | |
| Optional speaking practice (speech recognition) | Not implemented | Feasible with the browser speech recognition API where supported. Not built, and browser support differs. |
| Unsupported browser and missing voice handling | Partial | Existing `speakText` warns when speech synthesis is unavailable. No user-visible message yet. |

### 10.4 Social features

| Feature | Status | Evidence and limits |
|---|---|---|
| Block and unblock | Done (tested) | Symmetric hiding, friendship and request removal. UI: friend-card menu. |
| Report a user | Done (tested) | Reason enum, length limit, duplicate open report rejected. UI: friend-card menu. Admins review reports via the API. |
| Remove friend | Done (tested) | UI: friend-card menu. |
| Last seen and online presence | Partial | `lastSeenAt` is stored (throttled) and used for admin counts. **No presence UI.** Live online status belongs to Stream and is not wired. |
| Typing indicators | Not implemented | Stream provides typing events; not wired or verified. |
| Unread message counts | Not implemented | Stream can provide these; not wired or verified. |
| Message search and conversation search | Not implemented | Stream offers search; not wired or verified. |
| Notification preferences | Not implemented | No preference model. |

### 10.5 Admin dashboard

| Feature | Status | Evidence and limits |
|---|---|---|
| View registered users (paginated, searchable) | Done (tested) | `GET /api/admin/learning/users`. **No admin UI.** |
| View user activity | Done (tested) | `GET /users/:id/activity`. No admin UI. |
| Manage account status (suspend and reinstate) | Done (tested) | Suspension enforced on every authenticated request. No admin UI. |
| Review reported users | Done (tested) | `GET /reports`, `PATCH /reports/:id`. No admin UI. |
| Manage languages, categories, lessons, vocabulary, quizzes, assessments | Done (tested, API) | Validated writes and content lists. Vocabulary is managed through lesson writes; there is no separate vocabulary endpoint. No admin UI beyond the existing Stats and Seeder tabs. |
| Analytics: total, active, language enrolment, lesson completion, quiz performance, activity | Done (tested) | `GET /api/admin/learning/analytics`. No admin UI. |
| Administrator authorization on every admin API | Done (tested) | Every admin route is behind `protectRoute` and `adminOnly`. The self-claim route is disabled by default. Tested for non-admins on all new routes. |
| Validate question answers, prevent duplicate content, validate language mappings | Done (tested) | See `contentValidation.js` and `adminContent.controller.js`. |
| Safe content updates | Done (tested) | Partial updates are re-validated as a whole. Content is deactivated, not deleted. |

### 10.6 Notifications

| Feature | Status | Evidence and limits |
|---|---|---|
| Friend requests and acceptances | Not implemented | Visible on the Notifications page only (existing). No push. |
| Incoming messages, missed calls | Blocked | Needs Stream notification or push configuration and credentials. Not wired. |
| Learning and streak reminders | Partial | On-dashboard only. |
| Achievement unlocks | Partial | Existing achievements are shown on the progress page. No notification. |

**Decision:** no notification infrastructure was built. Stream's notification features require configuration in the Stream dashboard and credentials this environment does not have.

### 10.7 Application experience

| Area | Status | Evidence and limits |
|---|---|---|
| New pages: loading, empty, and error states | Done (code-verified) | Vocabulary page, AI tools page, goals card. |
| Responsive layouts for new pages | Done (code-verified) | Tailwind grid and flex classes. Not checked in a browser. |
| Accessible forms and controls | Partial | Labels, `aria-*` on icon buttons, live regions for results. Not audited with a screen reader. |
| Full review of every existing page (dashboard, login, onboarding, profiles, friends, chat, calls, learning, progress, admin) | Not performed | Requires a browser-level review pass. |
| Maintain visual identity | Done | Existing DaisyUI theme and components reused. |

### 10.8 Security and performance

See `BUG_AUDIT.md` §11 for the full review, findings, and fixes.

Summary of Phase 4 security work: `helmet` headers; a cross-origin request check for state-changing API calls; suspension enforcement; throttled activity tracking; per-user rate limits on AI routes; escaped admin search; administrator checks on every admin route; minimum signup password length raised to 8; validated admin content writes; no secrets in source (scanned).

Performance work: indexes for new collections; pagination on every new list; the translation cache; deduplication of identical in-flight translation requests; analytics counts limited to the active language pair.

### 10.9 End-to-end journeys

| Journey | Status |
|---|---|
| A. New user (signup, login, onboarding, profile, dashboard) | API verified. Browser not run. |
| B. Social (find, request, accept, message) | API verified. Stream messaging not verified. |
| C. Multilingual chat (both directions, independent preferences) | API verified with mocked providers. Live Stream and Gemini not verified. |
| D. Video calling | **Not tested.** Needs Stream Video credentials and two devices. |
| E. Language learning (select, lesson, practice quiz, assessment, rewards, progress) | API verified. Browser not run. |
| F. AI assistant (practice, grammar, save vocabulary) | API verified with a mocked model. Live Gemini not verified. |
| G. Administration (manage language, add lesson, add quiz, verify) | API verified. Admin UI not extended. |

### 10.10 Production readiness

| Check | Result |
|---|---|
| Frontend lint | 0 errors |
| Frontend production build | Passes |
| Backend tests | 137 of 137 pass (see TESTING_REPORT.md) |
| Backend startup without a database | Logs the cause and exits 1 |
| Backend startup with a database | Covered by the integration suite (in-memory MongoDB). Not run against a hosted database |
| API integration (frontend to API) | Verified for the endpoints each page calls, by code review and the API tests. Not clicked through in a browser |
| Database connection | Verified against in-memory MongoDB |
| Authentication, cookies, CORS, origin check | Tested over HTTP. Cookie `Secure` behaviour requires HTTPS in production |
| Stream integration | **Blocked** (no credentials). Failure paths tested |
| Gemini integration | **Blocked** (no credentials). Failure paths and mocked behaviour tested |
| Translation fallback (MyMemory) | Tested through the mock path. **Live call not made** |
| Environment variables | Documented in DEPLOYMENT_GUIDE.md. No secrets in source |
| Production CORS | Driven by `CLIENT_URL`. Verify against the real origin |
| Deployment configuration | Documented. Not deployed |

### 10.11 Known limitations (Phase 4)

1. No admin UI for users, reports, or analytics (API only).
2. No browser-level end-to-end tests. The journeys above are API-level.
3. Stream features (typing, unread counts, search, presence, notifications, video) are not wired or verified.
4. Gemini and MyMemory output quality is not verified live.
5. No content security policy (helmet's CSP is disabled because a generic one breaks Stream).
6. Rate limits are per process and in memory.
7. No server-side logout (tokens are valid until they expire).
8. The frontend bundle is large; code-splitting is not done.
9. Existing free-text language values need a one-off, reviewed migration.
10. Insert-into-chat for AI reply suggestions is not implemented.

---

## 11. AI repair and Stream translation status (latest)

- AI health: real provider probe, cached; statuses: available, not_configured, invalid_credentials, model_unavailable, quota_exceeded, provider_unavailable, network_error. Badge on the AI tools page and the chat bot.
- Live Gemini: chat, translation, detection, grammar, and word explanation verified with the configured key (see TESTING_REPORT.md).
- Stream Translate control: fixed (it read props that stream-chat-react never passes). Verified against the real message context in component tests; live Stream not verified.
- Chat bot: sends bounded conversation history; blocks duplicate submits.
- Not implemented: inserting AI reply suggestions into the Stream composer; a show-original-by-default setting.
