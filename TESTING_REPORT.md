# EchoChat — Testing Report

Last run: 2026-11-25 · Environment: Windows 11, Node 20.19.4, MongoDB 7.0.24 (mongodb-memory-server, in-memory, ephemeral), no Stream, Gemini, or MyMemory credentials.

## 1. Results summary

| Check | Command | Result |
|---|---|---|
| Backend full suite | `npm test` (backend) | **137 / 137 pass**, 0 fail, 0 skipped |
| Backend unit only | `npm run test:unit` | pass (grading, units, translation, phase 4 unit, HTTP) |
| Learning seed content | `npm run test:seed` | pass |
| Frontend lint | `npx eslint .` (frontend) | **0 errors** |
| Frontend production build | `npx vite build` | **pass** (bundle is large; see §5) |
| Backend startup, no database | `node src/server.js` with an unreachable `MONGO_URI` | logs the cause and exits 1 |
| Secrets scan of source | grep for key patterns; `git ls-files` for env files | no secrets found; no `.env` tracked |

## 2. Test inventory

| File | Type | Count | What it covers |
|---|---|---|---|
| `tests/grading.test.js` | unit | 10 | Quiz/assessment scoring, session-sized denominator, duplicate and foreign answers, arrange and match rules |
| `tests/units.test.js` | unit | 9 | Rate limiter, JWT failure modes (missing, tampered, expired, forged), User JSON, language helpers, text validation |
| `tests/translation.test.js` | unit | 13 | Language resolution, Gemini reply parsing, cache keys, validation short-circuits |
| `tests/phase4.unit.test.js` | unit | 26 | Content validation (questions by type, lessons, languages), goal and streak math, analytics summary, weak topics, incorrect-answer collection, shuffle, AI tutor (mocked model: parsing, normalization, limits, prompt delimiting, injection handling) |
| `tests/origin.test.js` | HTTP, no DB | 6 | Cross-origin rejection for state-changing requests; allowed origins; safe methods |
| `tests/http.test.js` | HTTP, no DB | 13 | Real Express app: auth gating on every protected route, JSON 404, malformed JSON, 413, claim-admin lockout, validation, cookie attributes, auth 429 |
| `tests/integration.test.js` | HTTP + MongoDB | 75 | Auth and persistence; social and blocking; admin gating and analytics; quiz and assessment sessions; translation cache, fallback, dedupe, preferences; vocabulary; goals; analytics; revision; suspension; content validation; AI tutor endpoints |

## 3. End-to-end journeys (API level)

Browser-driven journeys were **not run**. Each journey below is covered at the API level, against real MongoDB persistence, in `tests/integration.test.js`.

| Journey | Coverage | Status |
|---|---|---|
| A. New user: signup → login → onboarding → profile → dashboard data | signup, login, `/me` persistence, onboarding whitelist, profile PATCH | **API verified** · browser not run |
| B. Social: find → friend request → accept → message | recommendations, request, accept, friends list; message send is Stream (not run) | **API verified** · Stream messaging not verified |
| C. Multilingual chat: Hindi → Marathi → reply → Hindi, with independent preferences | per-user translation preferences, cache shared across users, fallback, same-language short-circuit | **API verified with mocked providers** · live Gemini quality and Stream UI not verified |
| D. Video calling | — | **Not tested** (requires Stream Video credentials and two devices) |
| E. Language learning: select languages → category → lesson → practice → assessment → rewards → progress | language selection, lesson completion (pair and level checks), session quiz, assessment unlock and stars, analytics and goals | **API verified** · browser not run |
| F. AI assistant: select language → practice → grammar → save vocabulary | practice, grammar, explain-word, vocabulary save (mocked model) | **API verified with mocked model** · live Gemini output not verified |
| G. Administration: admin login → manage language → add lesson → add quiz → verify | admin gating, language save, lesson create with duplicate and category checks, question create with validation and duplicate checks, analytics | **API verified** · admin UI not extended (see §6) |

## 4. Coverage of security-sensitive behaviour

Each item below has at least one automated test that failed before the fix and passes now, or asserts the intended refusal.

- Admin endpoints reject non-admins (403) and anonymous callers (401), including the new endpoints.
- Suspended accounts are refused on every authenticated route (403) and regain access when reinstated.
- Admin cannot suspend their own account; administrator accounts cannot be suspended through this endpoint.
- Admin user search escapes regex metacharacters (`(` and `$where` do not break or inject).
- Admin user listings never include password hashes.
- Block: symmetric hiding in recommendations, friend requests refused in both directions, friendship and pending requests removed.
- Report: reason enum enforced, details length capped, duplicate open reports rejected (409).
- Vocabulary and revision: another user's word ids return 404; quiz sessions are single-use and owner-bound.
- AI tutor: user text is delimited as data; prompt-injection text is labelled as data; history is capped at 10 turns; provider output is validated and its lengths capped; malformed model output returns 502 without echoing raw text.
- Content: answer-key-consistent validation (MCQ answer must be an option; arrange words must be a permutation; match keys must be distinct); language codes must be supported and active; duplicates rejected; deactivation hides the answer key.
- Origin check: cross-origin state-changing requests are rejected; allowed origins and safe methods pass (`tests/origin.test.js`, 6 tests).

## 5. Build and bundle

- Frontend build passes. The main JavaScript chunk is about 2.4 MB (about 0.7 MB gzip). This is unchanged in kind from earlier phases and is a known item (code-splitting is not yet done).

## 6. Not tested, and why

| Area | Reason |
|---|---|
| Stream Chat live (messages, channels, history, reconnect) | No Stream credentials |
| Stream Video (calls, invitations, permissions) | No Stream credentials; needs two users and devices |
| Stream notifications (friend request, message, missed call) | Not implemented; see DEPLOYMENT_GUIDE / PROJECT_FEATURES |
| Gemini output quality for each language pair, emojis, slang | No Gemini key; only the wiring and failure paths are tested |
| MyMemory live responses | No live call made; error-body handling is unit-tested through the mock path only |
| Browser UI (all pages, responsive layouts, screen readers) | No browser test harness in the repository. Manual checks are listed in §7 |
| Speech synthesis quality and voice availability | Browser-dependent |
| Performance under load | Not measured |
| Production deploy (HTTPS, cookies over TLS, real CORS origin) | Requires a deployment target |

## 7. Manual test checklist (to run before release)

1. Sign up with a new account, complete onboarding, choose Hindi and Marathi.
2. Open Learning → Today's goals; complete a lesson; confirm the goal updates.
3. Open Vocabulary book; add a word; mark it learned; open Review.
4. Open AI tools; check a Marathi sentence; explain a word and save it; practise a short conversation.
5. In Chat with a friend: send a Hindi message; as the other user, translate it into Marathi; confirm the original is unchanged; toggle Show original.
6. Turn automatic translation on for one user only; confirm the other user is unaffected.
7. Block a friend from the friend menu; confirm they disappear from both sides; unblock.
8. Report a user; as an admin, confirm the report appears and can be dismissed.
9. Suspend a test account from the admin API; confirm its next page load shows the suspended message.
10. Check the layout at phone, tablet, and desktop widths.


---

## Latest run: AI repair and Stream translation (2026-11-25)

| Check | Result |
|---|---|
| Backend `npm test` | **172 / 172 pass** (includes 29 Gemini service and controller tests, and 13 health and error integration tests with mocked provider transport) |
| Frontend `vitest run` | **15 / 15 pass** (Translate control in the real stream-chat-react message context; manual, automatic, retry, independent targets) |
| Frontend `eslint .` | 0 errors |
| Frontend `vite build` | passes |
| Backend startup with an unreachable database | logs the cause, exits 1 |

### Live Gemini check (real key, in-memory database, key never printed)

| Endpoint | Result |
|---|---|
| `GET /api/ai/health` | `available`, model `gemini-3.5-flash` |
| `POST /api/ai/chat` | 200, real reply (multilingual) |
| `POST /api/ai/translate` English to Hindi | 200, `नमस्ते, आप कैसे हैं?`, provider `gemini` |
| `POST /api/ai/translate` auto to Hindi | 429 once: Gemini quota reached during the run. The app returned `RATE_LIMITED` with a clear message. On an earlier run the same request returned 200 with detected Marathi and `मैं ठीक हूँ।` |
| `POST /api/ai/detect-language` | 200, `Marathi` / `mr` |
| `POST /api/ai/grammar` | 200 |
| `POST /api/ai/explain-word` | 200 |

### Not verified

- Stream Chat live: messages, channels, history, reconnect, and the Translate button in a real channel. The component is tested in the real Stream message context, but the full Stream UI needs credentials.
- Two independent users in a live channel. Covered by the component test that uses independent targets, not by two live accounts.
- Live MyMemory responses.
- Browser-level tests of the chat bot and the AI tools page.
- Gemini output quality for each language pair. Only the live samples above were checked.
