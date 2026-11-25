# EchoChat — Deployment Guide

This guide describes what to configure and in what order. Nothing here has been deployed or tested against a hosting provider. Items marked **(needs credentials)** cannot be verified without the external accounts.

## 1. Architecture at a glance

- One Node.js process serves the REST API under `/api` and, in production, the built React app from `frontend/dist`.
- MongoDB stores all application data.
- Stream Chat and Stream Video run in Stream's cloud. The browser connects to Stream directly with a public key.
- Google Gemini and MyMemory are called from the server only.

## 2. Environment variables

### Backend (`backend/.env`, never committed)

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | Set to `production`. Enables secure cookies, disables self-admin claim, and serves the frontend build. |
| `PORT` | yes | HTTP port (default 5001). |
| `MONGO_URI` | yes | MongoDB connection string. Use a dedicated production database and a least-privilege user. |
| `JWT_SECRET_KEY` | yes | Long random string (at least 32 bytes). Rotating it signs everyone out. |
| `CLIENT_URL` | yes | Public origin(s) of the frontend, comma-separated, for example `https://app.example.com`. Used for CORS and the origin check. |
| `STREAM_API_KEY` | for chat/video | Stream server key. |
| `STREAM_API_SECRET` | for chat/video | Stream server secret. **Server only.** Never placed in frontend code. |
| `GEMINI_API_KEY` | for AI | Gemini key. Without it, AI endpoints return 503 "not configured". |
| `GEMINI_MODEL` | optional | Model name. Defaults to `gemini-3.5-flash`, which answered on the v1beta API on 2026-11-25. `gemini-1.5-flash` and `gemini-2.5-flash` are retired or closed to new keys. |
| `ADMIN_EMAIL` | optional | Email treated as administrator in addition to `role: admin`. Prefer `npm run admin:grant`. |
| `AUTH_RATE_LIMIT_MAX` | optional | Login/signup attempts per 15 minutes per IP (default 30). |
| `ALLOW_SELF_ADMIN_CLAIM` | **never in production** | Development-only convenience. Ignored when `NODE_ENV=production`. |

### Frontend build-time (Vite, `frontend/.env.production`)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_STREAM_API_KEY` | for chat/video | Stream **public** API key. Safe to ship to the browser. |
| `VITE_API_URL` | only if the API is on another origin | Base URL including `/api`. Leave unset when the API and app share an origin. |

Never put `STREAM_API_SECRET`, `GEMINI_API_KEY`, or `MONGO_URI` in a `VITE_` variable.

## 3. Pre-deployment checklist

1. `NODE_ENV=production` is set on the server.
2. `CLIENT_URL` lists exactly the public app origin(s). Do not use `*`.
3. `ALLOW_SELF_ADMIN_CLAIM` is unset.
4. `JWT_SECRET_KEY` is a fresh random value, not the development value.
5. `MONGO_URI` points at the production database. Back it up before the first start.
6. The app is served over HTTPS. The auth cookie is `secure` only in production; without HTTPS, browsers will not return it.
7. Create the first administrator with `npm run admin:grant -- <email>` after the account has signed up. Run it on the server.
8. Run the test suite (`npm test` in `backend`) against a throwaway database, not production.
9. Run `npm run build` (root) and confirm `frontend/dist` exists.

## 4. Build and start

```bash
# from the repository root
npm run build          # installs both packages and builds the frontend
cd backend
NODE_ENV=production npm start
```

Health check: `GET /api/health` returns `{"status":"ok"}`. Use it for load balancer probes.

## 5. Reverse proxy and TLS

Terminate TLS at a reverse proxy (nginx, Caddy, or the platform's load balancer) and forward to the Node port. Required behaviour:

- Redirect HTTP to HTTPS.
- Pass the original `Host` header through, because the origin check compares it with the `Origin` header.
- Do not strip `Cookie` or `Origin` headers.
- Set a request body limit no larger than the application's 100 kB JSON limit to reject large requests early.

## 6. Security headers

`helmet` is enabled with its defaults **except** the Content Security Policy, which is disabled because a generic policy blocks Stream connections. Add a tuned CSP at the proxy or in `server.js` before production. A starting point must allow:

- `connect-src` for `https://chat.stream-io-api.com`, `wss://chat.stream-io-api.com`, the Stream video endpoints, `https://api.mymemory.translated.net`, and your own origin.
- `media-src` and `img-src` for Stream media and `https://api.dicebear.com`.
- `script-src 'self'` (the Vite build has no inline scripts).

Test the CSP in a browser before enabling it in enforcement mode.

## 7. Database

- Indexes are created automatically by Mongoose on startup (`autoIndex` default). On a large existing collection, build indexes during a quiet window. Relevant new indexes: `savedwords` (`user, targetLanguage, word` unique), `userreports` (`reporter, reported, status` partial unique), `translationcaches` (`key` unique; TTL on `expiresAt`), `quizsessions`, `users` (`lastSeenAt`, `accountStatus`).
- Do not run destructive migrations. The new `User` fields have defaults; existing documents need no change.
- Existing free-text `nativeLanguage` / `learningLanguage` values fail validation until a user updates them. Consider a one-off, reviewed script to map old names to canonical ones. Do not run it without a backup.
- Back up before the first production start and keep the backup until the release is confirmed.

## 8. External services

### Stream (needs credentials)
1. Create a Stream app. Copy the API key (public) and secret (server only).
2. Enable the Video product if video calling is used.
3. Confirm the token endpoint works for a real user (`GET /api/chat/token` while logged in).
4. Verify in a browser: messaging, reconnect after a network drop, video join, and a second device receiving messages.

### Google Gemini (needs credentials)
1. Create an API key in Google AI Studio or Google Cloud.
2. Choose a current model and set `GEMINI_MODEL`. Confirm with one manual request.
3. Watch quota. The app returns 429 to users when the provider reports rate limits.

### MyMemory
No key. It is a fallback for translation pairs it supports. Its free tier has daily limits; treat it as best effort.

### Notifications
Not implemented. Stream's notification features are not wired into the app and were not verified. Learning reminders are shown on the dashboard only.

## 9. Operations

- Logs: the server writes errors to stdout with short messages. Do not log request bodies; the app does not.
- Rate limits are in-memory per process. With more than one instance, limits apply per instance. Move to a shared store before scaling out.
- Scheduled jobs: none. Translation cache expiry and session expiry are handled by MongoDB TTL and by the application on read.
- Rollback: redeploy the previous build. Schema changes in this release are additive; rolling back the code does not require a data rollback.

## 10. Known limitations at release

See `PROJECT_FEATURES.md` §10 and `BUG_AUDIT.md`. In particular: no browser-level tests, no Stream verification without credentials, no CSP, no server-side logout, and a large frontend bundle.
