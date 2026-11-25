# EchoChat — API Documentation

Base URL: `http://localhost:5001/api` in development; `/api` (same origin) in production. Audit date: 2026-11-24.

**Auth:** Cookie `jwt` (httpOnly). Routes marked **[auth]** need it; **[admin]** also needs `role: "admin"` (or `ADMIN_EMAIL`). Error bodies are `{ message }` unless noted; AI endpoints use `{ error }`.

Status values: Working · Partially Working · Broken · Needs Verification.

---

## Auth — `/api/auth`

### POST `/signup` — Working (leaks hash, see C3)
Body: `{ fullName, email, password }` (password ≥ 6, valid email).
- `201` `{ success, user }` — **`user` includes the password hash today.**
- `400` missing fields / weak password / invalid email / email exists.
- Side effects: creates Stream user; sets `jwt` cookie (7d).

### POST `/login` — Partially Working (leaks hash, see C3)
Body: `{ email, password }`.
- `200` `{ success, user }`; `401` `{ message: "Invalid email or password" }`; `400` missing fields.
- Side effects: Stream upsert (failure is logged only); sets cookie.

### POST `/logout` — Working
- `200` `{ success, message }`. Clears cookie.

### GET `/me` — **[auth]** Working
- `200` `{ success, user }` (no password). Invalid/expired token currently returns **503** (should be 401, see H5).

### POST `/onboarding` — **[auth]** Partially Working (mass assignment, see C4)
Body: `{ fullName, bio, nativeLanguage, learningLanguage, location }` — all required.
- `200` `{ success, user }`; `400` `{ message, missingFields[] }`.
- Note: the controller currently persists every field in the body, not just these five.

---

## Users and friends — `/api/users` (all **[auth]**)

### GET `/` — Partially Working (exposes hashes, see C2)
Returns an array of onboarded users who are not the caller and not already friends. Returns full documents.

### GET `/friends` — Working
Returns `[{ _id, fullName, profilePic, nativeLanguage, learningLanguage }]`.

### POST `/friend-request/:id` — Working
- `201` friend request document.
- `400` self, already friends, or request exists (either direction). `404` recipient not found.

### PUT `/friend-request/:id/accept` — Partially Working
- `200` `{ message: "Friend request accepted" }`. Caller must be the recipient; `403` otherwise; `404` not found.
- Does not verify `status === "pending"` (R4).

### GET `/friend-requests` — Working
- `200` `{ incomingReqs: [pending, populated sender], acceptedReqs: [accepted, populated recipient] }`.

### GET `/outgoing-friend-requests` — Working
- `200` array of pending requests with populated recipient.

**Not implemented:** reject (`DELETE`/`PUT .../reject`), cancel, unfriend, search.

---

## Chat and video — `/api/chat` (all **[auth]**)

### GET `/token` — Working
- `200` `{ token }` Stream user token (no expiry, see M1). Upserts the caller to Stream.

### POST `/user/:id` — Working (see M4)
- `200` `{ success, userId }`; `404` user not found; `500` `{ message: "Unable to sync Stream user" }`.
- Any authenticated user can target any id.

---

## AI — `/api/ai` (all **[auth]**, errors use `{ error }`)

Rate limiting: **none** (H3).

### POST `/chat`
Body: `{ message: string, language?: string }`.
- `200` `{ success, userMessage, aiResponse, detectedLanguage }`.
- `400` `{ error: "Message is required" }`; `503` `{ error }` on Gemini failure (403 → "replace the revoked key").
- Prompt-injection surface (H4). `detectedLanguage` echoes the requested language, not a detection.

### POST `/translate`
Body: `{ text, targetLanguage = "en", sourceLanguage = "auto" }`. **Pass ISO codes** (R2); the UI currently sends names.
- `200` `{ success, originalText, translatedText, targetLanguage }`.
- Falls back to MyMemory when Gemini throws. `503` if both fail. `400` if `text` missing.

### POST `/detect-language`
Body: `{ text }`. `200` `{ success, text, detection }` where `detection` is the raw model text. No frontend caller found (backend-only).

---

## Learning — `/api/learning` (all **[auth]**)

### GET `/languages`
- `200` active `Language[]`.

### GET `/user-selection`
- `200` current `activeLanguagePair` with resolved language documents and progress.

### POST `/select-language`
Body: `{ nativeLanguage, targetLanguage }` (codes, case-insensitive).
- `200` `{ success, nativeLanguage, targetLanguage, progress }`.
- `400` missing or identical; `404` unsupported/inactive; `500` on non-string input (R5).

### GET `/dashboard`
- `200` summary for the active pair including `levels` and `achievements` (plus progress and streak data).

### GET `/categories?level=easy|medium|hard`
- `200` categories (filtered by level if provided).

### GET `/lessons/:categoryId`
- `200` lessons for the category in the active pair, with vocabulary and grammar notes. Content only exists for hi→mr.

### POST `/lessons/:lessonId/complete`
- `200` `{ success, message, userLesson, newAchievements[] }`. `404` lesson not found.
- No prerequisite check (M2).

### GET `/quiz/:categoryId`
- `200` up to 10 randomly chosen questions for the category, with answers stripped. `404` category not found.

### POST `/quiz/submit`
Body: `{ categoryId, answers: [{ questionId, userAnswer }], timeTakenSeconds }`.
- `200` `{ success, score, correctAnswers, incorrectAnswers, detailedFeedback[] }`.
- **Problems:** denominator is `answers.length` (H1); `detailedFeedback[].correctAnswer` is returned; questions are not bound to the served quiz.
- `400` when `answers` is empty or not an array.

### GET `/assessment/:level` (`easy|medium|hard`)
- `200` randomly chosen questions (Easy 10, Medium 15, Hard 20) with answers stripped.
- `400` invalid level; `403` `{ message: "Level X is locked." }` if not unlocked.
- Selection is **not stored**, so the submit step cannot verify it (C5).

### POST `/assessment/submit`
Body: `{ level, answers: [{ questionId, userAnswer }], timeTakenSeconds }`.
- `200` `{ success, attemptId, level, totalQuestions, correctAnswers, incorrectAnswers, scorePercentage, timeTakenSeconds, starsEarned, newStarsAwarded, totalStars, previousBestScore, isPassed, nextLevelUnlocked, newAchievements[], detailedFeedback[] }`. `detailedFeedback[]` includes `correctAnswer` and `explanation` (C5).
- `400` invalid level or empty answers; `403` locked level.
- **Problems:** C5 (client-chosen questions and denominator, answer key in response).
- Pass rule: `scorePercentage >= 60`. Passing Easy unlocks Medium; Medium unlocks Hard.

### GET `/assessment-result/:attemptId`
- `200` `QuizAttempt` document. `404` not found.
- Ownership is enforced in the query (`_id` + `user`), so other users' attempts return 404 (H2 checked).

### GET `/progress`
- `200` profile: progress across levels, rewards history, achievements (sorted by `unlockedAt` desc).

---

## Admin learning — `/api/admin/learning`

| Method & path | Auth | Status | Notes |
|---|---|---|---|
| POST `/claim-admin` | [auth] | **Broken (C1)** | Any user becomes admin. Remove or gate. |
| GET `/stats` | [admin] | Working | Totals, passed assessments by level, top 5 target languages. |
| POST `/seed` | [admin] | Working | Runs the idempotent seeder. |
| POST `/languages` | [admin] | Working (API only) | Upsert by `code`. Requires `code, name, nativeName, script`. |
| POST `/categories` | [admin] | Working (API only) | Upsert by `slug`. Requires `slug, name`. |
| POST `/lessons` | [admin] | Working (API only) | Creates lesson and vocabulary; `201`. |
| POST `/questions` | [admin] | Working (API only) | Creates a question; `201`. |

There is no admin UI for languages, categories, lessons, or questions — only the stats and seeder tabs exist.

---

## Health and static

- No `/health` or readiness endpoint.
- In production, any non-`/api` GET returns `frontend/dist/index.html`.

## Error handling summary

| Situation | Response |
|---|---|
| No cookie / bad token | `401` (no cookie) · **`503` (bad or expired token — should be 401)** |
| Mongo unreachable during a request | `503` |
| Validation | `400` |
| Unhandled controller errors | `500 { message: "Internal server error" }` |
| Unknown route | Express default 404 (HTML) — no JSON 404 handler |

---

## Phase 2 changes (supersede the entries above where they differ)

- `POST /api/auth/signup`, `POST /api/auth/login`: responses no longer include `password`. Duplicate email → **409**. Login rate-limited (30 / 15 min / IP).
- `POST /api/auth/onboarding`: only `fullName, bio, nativeLanguage, learningLanguage, location, profilePic` are written. Other fields are ignored.
- `PATCH /api/auth/profile` (**new**): same whitelist; partial updates; 400 on empty or non-string values.
- `GET /api/users`: public fields only; excludes self, friends and pending-request users; limit 50.
- `PUT /api/users/friend-request/:id/reject` (**new**): recipient only; pending only; removes the request.
- `DELETE /api/users/friend-request/:id` (**new**): sender only; pending only; removes the request.
- `PUT /api/users/friend-request/:id/accept`: pending only (409 otherwise).
- `GET /api/chat/token`: 503 when Stream is not configured; token expires after 24 h.
- `POST /api/chat/user/:id`: self, friends or admin only (403 otherwise).
- `/api/ai/*`: 20 requests / minute / IP (429). Input ≤ 2000 characters. 503 `"AI service is not configured"` without a key. `translate` accepts language names or codes. `detect-language` returns `languageCode` and `languageName`.
- `GET /api/learning/quiz/:categoryId` and `GET /api/learning/assessment/:level`: return **`sessionId`** and `expiresAt`. Questions are served from the session only.
- `POST /api/learning/quiz/submit` and `POST /api/learning/assessment/submit`: **require `sessionId`**. Answers may reference only that session's questions, and each may appear once. The denominator is the session size. A session is single-use: a second submit → 409, expired → 410, another user's session → 404. Invalid answers → 400 and the session stays open.
- `POST /api/learning/lessons/:lessonId/complete`: 400 for a bad id, 403 for a lesson outside the active pair or a locked level, 404 for an unpublished or missing lesson.
- `POST /api/admin/learning/claim-admin`: **404** unless `NODE_ENV !== "production"` and `ALLOW_SELF_ADMIN_CLAIM=true`.
- `GET /api/health` (**new**): `{ "status": "ok" }`.
- Unknown `/api` routes → JSON `404`. Malformed JSON → `400`. Bodies over 100 kB → `413`.
- Expired or invalid JWT → **401** (previously 503).

---

## Phase 3: chat translation

### `POST /api/ai/translate` (replaces the earlier contract; still **[auth]**)

Rate limit: **60 requests / minute per user** (`429`, `Retry-After`).

Request:
```json
{ "text": "तुम कैसे हो?", "targetLanguage": "Marathi", "sourceLanguage": "Hindi" }
```
- `text`: required, non-empty after trim, ≤ 2000 characters.
- `targetLanguage`: required. A supported language **name or code** (`"Marathi"` or `"mr"`).
- `sourceLanguage`: optional. Omit it or send `"auto"` to auto-detect. A supported value is used as a hint; the reported source is the hint when given, otherwise the detected language.

Response `200`:
```json
{
  "success": true,
  "originalText": "तुम कैसे हो?",
  "translatedText": "तू कसा आहेस?",
  "sourceLanguage": "Hindi",
  "sourceCode": "hi",
  "detectedLanguage": "Hindi",
  "targetLanguage": "Marathi",
  "targetCode": "mr",
  "provider": "gemini",
  "cached": false
}
```
- `provider`: `gemini`, `mymemory` (fallback), or `none` (source equals target; no provider call).
- `cached`: `true` when served from the MongoDB translation cache.

Errors (body always has `error` and `code`):

| Status | `code` | Meaning |
|---|---|---|
| 400 | `EMPTY_TEXT` | Missing or whitespace-only text |
| 400 | `TEXT_TOO_LONG` | More than 2000 characters |
| 400 | `UNSUPPORTED_TARGET` | Missing or unsupported `targetLanguage` |
| 400 | `UNSUPPORTED_SOURCE` | `sourceLanguage` given but unsupported |
| 401 | — | Not logged in |
| 429 | `RATE_LIMITED` | Gemini quota exceeded and fallback failed, or per-user limit hit |
| 503 | `PROVIDERS_UNAVAILABLE` | Gemini and MyMemory both failed. No provider details are returned. |
| 503 | `NOT_CONFIGURED` | `GEMINI_API_KEY` missing and fallback unavailable |

Behaviour: identical requests (same text, source, and target) share one provider call while in flight, and results are cached for 30 days. Failed translations are never cached.

Provider order: Gemini (asked for JSON with `detected_language_code` and `translation`) → MyMemory (only for languages it supports; `myMemory` flag in the language list).

### `PATCH /api/auth/translation-preferences` (new, **[auth]**)

Per-user viewing preferences. Only these fields are accepted; anything else is ignored.

| Field | Type | Notes |
|---|---|---|
| `targetChoice` | `"native" \| "learning" \| "custom"` | Which language the viewer translates into. Follows the native or learning language live. |
| `customTargetLanguage` | supported language name | Used when `targetChoice` is `custom`. Required before choosing `custom`. |
| `autoTranslate` | boolean | Incoming text messages are translated automatically. |
| `displayMode` | `"inline" \| "compact"` | Presentation only. |

Response `200`: `{ success, user }` (the user including `translationPreferences`). `400` for invalid values or an empty body. The language fields (`nativeLanguage`, `learningLanguage`) are not changed by this endpoint.

### Changed: `PATCH /api/auth/profile` and `POST /api/auth/onboarding`

`nativeLanguage` and `learningLanguage` must be **supported languages** (name or code). They are stored as canonical names (`"Marathi"`). Unsupported values return `400`. Changing one does not change the other or the translation preferences.

### Changed: `GET /api/auth/me` and login

The user object now includes `translationPreferences` (`{ targetChoice, customTargetLanguage, autoTranslate, displayMode }`). Users created before this change receive the defaults (`native`, auto off, inline).

### Rate limits (changed)

- `/api/ai/chat`, `/api/ai/detect-language`: 20 / minute per **user** (was per IP).
- `/api/ai/translate`: 60 / minute per **user**.


---

## Phase 4 endpoints

All endpoints need a logged-in user (**[auth]**) unless marked **[admin]**. Admin endpoints also require `role: admin`. Suspended accounts get `403` on every authenticated route. Errors return `{ message }` (AI endpoints also return `code`).

### Social safety (`/api/users`, **[auth]**)

| Method and path | Behaviour |
|---|---|
| `POST /:id/block` | Blocks a user. Ends the friendship and removes pending requests in both directions. `400` for self, `404` for an unknown user. |
| `DELETE /:id/block` | Unblocks. |
| `GET /blocked` | Blocked users (public fields). |
| `POST /:id/report` | Body `{ reason, details? }`. `reason` is one of `harassment`, `spam`, `inappropriate_content`, `impersonation`, `other`. `details` up to 1000 characters. `201` created; `409` if you already have an open report for this user. |
| `DELETE /friends/:id` | Removes a friend from both lists and deletes the accepted request so either side can request again. `404` if not friends. |

Recommendations hide users you blocked and users who blocked you. Sending a friend request to a user in either block direction returns `403` with a generic message.

### Vocabulary book (`/api/learning/vocabulary`, **[auth]**, scoped to the active target language)

| Method and path | Body or query | Behaviour |
|---|---|---|
| `GET /vocabulary` | `page`, `limit` (max 100), `learned=true` or `false`, `mode=review` | Paginated. `mode=review` returns learned words, least recently reviewed first. |
| `POST /vocabulary` | `{ word, meaning?, partOfSpeech?, example?, exampleTranslation?, origin? }` or `{ lessonVocabularyId }` | `201`. `409` for a duplicate word in this language. `origin` is `manual` or `ai`; a lesson copy is `lesson`. |
| `PATCH /vocabulary/:id` | `{ learned?, meaning?, partOfSpeech?, example?, exampleTranslation? }` | `404` for a missing or another user's word. |
| `POST /vocabulary/:id/review` | none | Increments `reviewCount` and sets `lastReviewedAt`. |
| `DELETE /vocabulary/:id` | none | `404` for a missing or another user's word. |

### Daily goals and analytics (`/api/learning`, **[auth]**)

| Method and path | Behaviour |
|---|---|
| `GET /goals/today` | `{ date, timezone: "UTC", goals: { lessons, quizzes }, streak: { current, longest, atRisk }, reminder }`. Day boundaries are UTC. |
| `PATCH /goals` | Body `{ dailyLessons?, dailyQuizzes? }`, whole numbers from 0 to 10. A target of 0 counts as met. |
| `GET /analytics` | Lessons completed and available, quiz attempts, questions answered, correct and incorrect counts, accuracy percent, streak, quiz time, unlocked levels, total stars, best score per level, and progress by category. **No proficiency score** is computed, because no scoring methodology is defined. Only quiz time is measured. |

### Revision (`/api/learning/revision`, **[auth]**)

| Method and path | Behaviour |
|---|---|
| `GET /lessons` | Completed lessons for the active pair, newest first (up to 100). |
| `GET /weak-topics` | Up to 3 categories with the lowest quiz accuracy, requiring at least 5 answered questions in the category. |
| `GET /incorrect` | Up to 50 questions answered incorrectly that are still active, newest first, without duplicates. |
| `POST /quiz` | Starts a revision quiz of up to 10 incorrectly answered questions. Returns `sessionId` and questions with answers removed. Submit with the existing `POST /quiz/submit`, which requires `sessionId`. `409` when fewer than 3 wrong answers are available. |

### AI learning assistant (`/api/ai`, **[auth]**, 20 requests per minute per user)

Language fields accept a supported name or code and default to the saved profile. Input is capped at 500 characters. Provider output is validated before it is returned.

| Method and path | Body | Response |
|---|---|---|
| `POST /grammar` | `{ text, learningLanguage?, nativeLanguage? }` | `{ isCorrect, corrected, explanation, naturalAlternative, mistakes }`, with at most 5 mistakes. Explanations are in the native language. |
| `POST /explain-word` | `{ word, learningLanguage?, nativeLanguage? }` | `{ word, meaning, partOfSpeech, usage, examples }`, with at most 3 examples, each having `target` and `native`. |
| `POST /practice` | `{ message, history?, difficulty, scenario, learningLanguage?, nativeLanguage? }` | `{ reply, translation, tip, difficulty, scenario }`. `difficulty`: `beginner`, `intermediate`, `advanced`. `scenario`: `greeting`, `small talk`, `market`, `restaurant`, `travel`, `doctor visit`, `job interview`, `making plans`. `history` keeps the last 10 turns. |
| `POST /suggest-replies` | `{ messages: [{ fromOther, text }], learningLanguage?, nativeLanguage? }` | `{ suggestions: [{ text, translation }] }`, up to 3. Requires at least one message from the other person. Returned to the client only; nothing is sent automatically. |

Errors: `400` for empty input, unsupported languages, a bad difficulty or scenario, and identical native and learning languages. `502` with code `BAD_AI_RESPONSE` when the model reply cannot be validated (the raw text is not returned). `503` when the provider is unavailable or not configured. `429` when the limit is reached.

### Admin: users and moderation (`/api/admin/learning`, **[admin]**)

| Method and path | Behaviour |
|---|---|
| `GET /users` | Query `search` (escaped, case-insensitive, matches name or email), `status=active` or `suspended`, `page`, `limit` (max 100). Safe fields only; no password hash. |
| `GET /users/:id/activity` | User plus counts: quiz attempts, lessons completed, friends, pending requests, reports against, and language progress. |
| `PATCH /users/:id/status` | Body `{ accountStatus: "active" or "suspended" }`. Refused for your own account (`400`) and for administrator accounts (`400`). |
| `GET /reports` | Query `status=open`, `reviewed`, `dismissed`, or `actioned`, plus `page` and `limit`. Includes reporter and reported names. |
| `PATCH /reports/:id` | Body `{ status: "reviewed", "dismissed", or "actioned" }`. Records the reviewing admin and the time. |
| `GET /analytics` | Users (total, active in the last 7 and 24 hours, suspended), enrolment by language pair, lessons completed, quiz performance by type (attempts, average score, pass rate), quiz activity for the last 7 days, and open reports. |

### Admin: learning content (`/api/admin/learning`, **[admin]**)

Writes are validated. Duplicates are rejected with `409`. Content is deactivated, not deleted, so learner history stays valid.

| Method and path | Behaviour |
|---|---|
| `GET /content/languages`, `/content/categories`, `/content/lessons`, `/content/questions` | Paginated lists. Questions support `level`, `type`, `sourceLanguage`, `targetLanguage`, and `isAssessment` filters. |
| `POST /languages` | Upsert by code. The code must be in the supported list. |
| `POST /categories` | Unchanged from earlier phases. |
| `POST /lessons` | Requires a known category, active languages, a distinct pair, and a title unique for the pair and level. `vocabulary` rows are upserted by source text. |
| `PUT /lessons/:id` | Partial update, re-validated as a whole. |
| `POST /questions` | Validated by type. An MCQ answer must be one of the options. Arrange-words must be a permutation of the correct order. Match keys must be distinct. Text answers are length-capped. Duplicate text for the same pair, level, and type is rejected (case-insensitive). |
| `PUT /questions/:id` | Re-validates the merged question and rejects a clash with another question. |
| `PATCH /questions/:id/active` | Body `{ isActive: boolean }`. The response hides the answer key. |
| `POST /language-pair/check` | Validates a source and target pair without saving. |
| `POST /seed` | Unchanged. Idempotent. |

Retained from earlier phases: `GET /stats`, `POST /claim-admin` (disabled unless explicitly enabled outside production), `POST /languages`, `POST /categories`, `POST /lessons`, `POST /questions`.

### Changed behaviour

- Signup requires a password of at least **8** characters (was 6).
- `PATCH /api/auth/profile` and onboarding reject unsupported native or learning languages.
- A state-changing request whose `Origin` header is present and not allowed returns `403 Cross-origin request rejected`. Requests without an `Origin` header are not affected.
- Responses include security headers from `helmet` (CSP disabled; see DEPLOYMENT_GUIDE.md).
- Each authenticated request updates `lastSeenAt` at most once every 5 minutes.


---

## AI services repair (latest)

### Health check

`GET /api/ai/health` (requires login). Returns the result of a real, cached provider probe. A key being present is not enough to report `available`.

```json
{ "success": true, "provider": "Google Gemini", "configured": true, "model": "gemini-3.5-flash",
  "status": "available", "message": "AI is available.", "checkedAt": "2026-11-25T...", "cached": false }
```

`status` is one of: `available`, `not_configured`, `invalid_credentials`, `model_unavailable`, `quota_exceeded`, `provider_unavailable`, `network_error`. The response never contains the key. Results are cached for 5 minutes when available and 60 seconds when failing. Concurrent checks share one probe. `?refresh=true` forces a new probe, at most once every 10 seconds.

### Chat with context

`POST /api/ai/chat` accepts an optional `history` array: `[{ "role": "user" | "assistant", "text": "..." }]`. Only the last 8 turns are used, each capped at 500 characters, and they are sent to the model as delimited data. Response shape is unchanged.

### Errors from AI endpoints

Every AI error response has `error` (a user-safe sentence) and `code`:

| `code` | HTTP | Meaning |
|---|---|---|
| `NOT_CONFIGURED` | 503 | No `GEMINI_API_KEY` on the server |
| `INVALID_CREDENTIALS` | 503 | Google rejected the key |
| `MODEL_UNAVAILABLE` | 503 | The configured model is retired or not available to the key |
| `QUOTA_EXCEEDED` | 429 | Provider usage limit reached |
| `PROVIDER_UNAVAILABLE` | 503 | Provider overloaded or failing (usually temporary) |
| `NETWORK_ERROR` | 503 | Server could not reach Google |
| `TIMEOUT` | 504 | Provider took longer than 20 seconds |
| `BAD_RESPONSE` | 502 | Model reply was empty or not in the expected shape |

`POST /api/ai/translate` keeps its existing codes (`RATE_LIMITED`, `PROVIDERS_UNAVAILABLE`, `NOT_CONFIGURED`, and others). Translation falls back to MyMemory only for supported language pairs, and only within a daily character budget (`MYMEMORY_DAILY_CHAR_LIMIT`, default 5000, tracked per process).

### Model

- Default `GEMINI_MODEL`: `gemini-3.5-flash`. It answered on the v1beta API on 2026-11-25 for the configured key.
- `gemini-1.5-flash` returns 404 `NOT_FOUND`. It is no longer served.
- `gemini-2.5-flash` returns 404: "no longer available to new users".
- `gemini-3.8-flash`, which Google recommends, returned 503 "high demand" during the same session. It is a valid option when it is not overloaded.
- A malformed `GEMINI_MODEL` value falls back to the default and logs a warning.

### Gemini SDK

`@google/generative-ai` 0.12.0 is still used. It supports the request format the API requires (v1beta `generateContent`) and per-request `timeout`. Google now recommends `@google/genai`; migrating is a separate, tested change and was not done in this pass.
