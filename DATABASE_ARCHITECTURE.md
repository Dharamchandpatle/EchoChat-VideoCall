# EchoChat — Database Architecture

Database: MongoDB via Mongoose 8.16. Connection string: `MONGO_URI`. Audit date: 2026-11-24.

## 1. Collections overview

| Model (file) | Collection (default) | Purpose | Key relations |
|---|---|---|---|
| `User` (`User.js`) | `users` | Account, profile, friends, role, active language pair | `friends → User` |
| `FriendRequest` (`FriendRequest.js`) | `friendrequests` | Pending/accepted requests | `sender, recipient → User` |
| `Language` | `languages` | 21 supported Indian languages | — |
| `LearningCategory` | `learningcategories` | 15 practical topics with level | — |
| `Lesson` | `lessons` | Lesson per (source, target, category, level) | `category → LearningCategory` |
| `LessonVocabulary` | `lessonvocabularies` | Words/phrases per lesson | `lesson → Lesson`, `category` |
| `LevelAssessment` | `levelassessments` | Assessment config per (source, target, level) | — |
| `QuizQuestion` | `quizquestions` | 7-type questions; `isAssessment` flag | `category` |
| `QuizAttempt` | `quizattempts` | Practice and assessment attempts with answers | `user`, `level`, `type` |
| `UserLanguageProgress` | `userlanguageprogresses` | Per user and pair: unlocked levels, stars, streak | `user` |
| `UserLessonProgress` | `userlessonprogresses` | Per user and lesson completion | `user, lesson, category` |
| `UserReward` | `userrewards` | Star ledger entries per assessment attempt | `user, assessmentAttempt` |
| `UserAchievement` | `userachievements` | Badges | `user` |

Mongoose pluralises model names for collection names. Confirm actual names with `db.getCollectionNames()` on a live database (**Needs Verification**).

## 2. Core schemas

### User
| Field | Type | Notes |
|---|---|---|
| `fullName` | String, required | |
| `email` | String, required, **unique** | No format validation at model level (controller checks regex) |
| `password` | String, required, `minlength: 6` | bcrypt hash via `pre("save")`. **Bypassed by `findByIdAndUpdate`** (see mass assignment). |
| `bio`, `profilePic`, `nativeLanguage`, `learningLanguage`, `location` | String | Defaults `""` |
| `isOnboarded` | Boolean, default `false` | |
| `friends` | [ObjectId → User] | Bidirectional, maintained by `acceptFriendRequest` |
| `role` | enum `user`/`admin`, default `user` | **Self-assignable** (see BUG_AUDIT C1, C4) |
| `activeLanguagePair` | `{ nativeLanguage: "hi", targetLanguage: "mr" }` | Defaults only; set by `select-language` |
| timestamps | `createdAt`, `updatedAt` | |

Indexes: `email` unique (implicit).

### FriendRequest
`sender`, `recipient` (ObjectId → User, required), `status` enum `pending|accepted` (default `pending`). Timestamps.
Indexes: **none beyond `_id`** — add unique `{sender, recipient}` (BUG M10). Note `status` has no `rejected`.

### Language
`code` (unique, lower-case), `name`, `nativeName`, `script`, `description`, `flagCode` (default `in`), `isActive` (default true), `order`.

### LearningCategory
`slug` (unique), `name`, `description`, `icon` (default `BookOpen`), `level` (`easy|medium|hard`), `order`, `isActive`.

### Lesson
`title`, `description`, `category → LearningCategory`, `sourceLanguage`, `targetLanguage` (codes), `level`, `order`, `grammarNotes`, `isPublished`.
Index: `{sourceLanguage, targetLanguage, category, level}` (non-unique; `seedLearningDatabase` uses it as an upsert key).

### LessonVocabulary
`lesson → Lesson`, `category`, `sourceText`, `targetText`, `romanized`, `partOfSpeech` (default `phrase`), `exampleSource`, `exampleTarget`, `exampleRomanized`, `order`.
Index: `{lesson, order}`. Seeder upserts on `{lesson, sourceText}`; **no unique index on that pair**, so duplicates are possible if the seed runs concurrently.

### LevelAssessment
`sourceLanguage`, `targetLanguage`, `level`, plus config. Unique index `{sourceLanguage, targetLanguage, level}`.

### QuizQuestion
`sourceLanguage`, `targetLanguage`, `level`, `category`, `isAssessment`, `type` (one of 7), `question`, `options` (for MCQ), `correctAnswer` (string, or object for `match`), `correctOrder` (array, for `arrange_words`), `pairs` (for `match`), `wordsToArrange`, `explanation`.
Indexes: `{sourceLanguage, targetLanguage, level, isAssessment}`, `{category, isAssessment}`.
**Sensitive:** `correctAnswer`, `correctOrder`, and `explanation` must never reach the client during an active quiz (see C5).

### QuizAttempt
`user`, `sourceLanguage`, `targetLanguage`, `level`, `type` (`practice|assessment`), `isPassed`, score fields, `answers` (embedded `detailedFeedback` incl. correct answers), timestamps.
Index: `{user, type, level, createdAt:-1}`.

### UserLanguageProgress
`user`, `nativeLanguage`, `targetLanguage`, `currentLevel`, `unlockedLevels` [string], `totalStars`, `levelStars {easy,medium,hard}`, `levelBestScores {easy,medium,hard}`, `streak {current, longest, lastActiveDate}`, `lastLearnedAt`.
Unique index: `{user, nativeLanguage, targetLanguage}`.

### UserLessonProgress
`user`, `lesson`, `category`, `sourceLanguage`, `targetLanguage`, `level`, `isCompleted`, `completedAt`.
Unique: `{user, lesson}`. Also `{user, category}`.

### UserReward
`user`, `assessmentAttempt`, `level`, `transactionType`, `stars`, timestamps.
Unique: `{user, assessmentAttempt}` (prevents double awarding). Also `{user, level, transactionType}`.

### UserAchievement
`user`, `badgeId`, `title`, `description`, `icon`, `unlockedAt`.
Unique: `{user, badgeId}`.

## 3. Relationships

```
User ──< FriendRequest >── User
User ──< friends >── User          (array on User)
Language (code) ─ referenced by string from User.activeLanguagePair, Lesson, QuizQuestion, progress
LearningCategory ──< Lesson ──< LessonVocabulary
LearningCategory ──< QuizQuestion
User ──< UserLanguageProgress (per pair)
User ──< UserLessonProgress >── Lesson
User ──< QuizAttempt
QuizAttempt ──1 UserReward
User ──< UserAchievement
```

Language and content are linked by **string codes** (`hi`, `mr`) rather than ObjectIds. This works, but code changes must be coordinated across models.

## 4. Data flow for key operations

| Operation | Reads | Writes |
|---|---|---|
| Signup | User (`findOne` by email) | User (`create`) |
| Login | User | — |
| Accept friend request | FriendRequest | FriendRequest (save), User ×2 (`$addToSet`) — **not transactional** |
| Practice quiz submit | User, QuizQuestion ×N | QuizAttempt |
| Assessment submit | User, UserLanguageProgress, QuizQuestion ×N | QuizAttempt, UserLanguageProgress (save), UserReward, UserAchievement |
| Complete lesson | Lesson, UserLanguageProgress | UserLessonProgress (upsert), UserLanguageProgress (save), UserAchievement |
| Select language pair | Language ×2, UserLanguageProgress | User (`findByIdAndUpdate`), UserLanguageProgress (create) |
| Seed database | all content | upserts on all content models |

## 5. Integrity and scaling notes

- **No transactions** are used anywhere. Friend acceptance and assessment submission each perform several writes.
- `QuizAttempt.answers` is embedded and grows with the number of questions; fine at current sizes.
- Admin stats run ~9 separate `countDocuments` calls; could be one aggregation or cached.
- `getRecommendedUsers` loads every onboarded user without pagination; index `{isOnboarded:1}` would help, but pagination is the real fix.
- Seeder is safe to re-run (upserts) except for vocabulary duplicates noted above.

## 6. Open verification items

- Confirm index creation actually happened (`db.<collection>.getIndexes()`) on the target database.
- Confirm there are no duplicate `LessonVocabulary` rows after multiple seed runs.
- Confirm no existing user documents have a plaintext `password` (a side-effect of C4).

---

## Phase 3: translation changes

### User: `translationPreferences` (new embedded object)

| Field | Type | Default | Notes |
|---|---|---|---|
| `targetChoice` | enum `native`, `learning`, `custom` | `native` | Which language the viewer translates into. Resolved at read time from `nativeLanguage`, `learningLanguage`, or `customTargetLanguage`. |
| `customTargetLanguage` | String | `""` | Canonical supported language name. |
| `autoTranslate` | Boolean | `false` | Per user. |
| `displayMode` | enum `inline`, `compact` | `inline` | Per user. |

Existing documents have no such field; Mongoose applies the defaults when they are loaded. No migration is required. Each user's preferences are stored only on that user's document.

`User.nativeLanguage` and `User.learningLanguage` are now canonical supported language **names** (e.g. `"Marathi"`), validated on onboarding and profile update. Older free-text values are not rewritten automatically; they will fail validation on their next update until corrected.

### New collection: `translationcaches` (model `TranslationCache`)

| Field | Type | Notes |
|---|---|---|
| `key` | String, **unique** | `sha256("<source or auto>|<target>|<trimmed text>")` |
| `sourceLanguage` | String | ISO code or `auto` |
| `targetLanguage` | String | ISO code |
| `detectedLanguage` | String \| null | Code reported by the provider, when known |
| `originalText` | String | Stored for auditing; not user-scoped |
| `translatedText` | String | |
| `provider` | enum `gemini`, `mymemory` | |
| `expiresAt` | Date | Set to now + 30 days |
| timestamps | `createdAt`, `updatedAt` | |

Indexes: `key` (unique, implicit from `unique: true`), and a **TTL index on `expiresAt` (`expireAfterSeconds: 0`)** so MongoDB removes expired entries. The cache is content-addressed and shared across users, because a translation depends only on the text and languages. It holds no personal preference data. Expected size is small: one document per distinct (text, source, target) translated.

### Index notes

- `translationcaches`: `{ key: 1 }` unique; `{ expiresAt: 1 }` TTL.
- `users`: no new indexes. Preferences are read with the user document.

---

## Phase 4: new and changed models

### New: `SavedWord` (collection `savedwords`)

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId → User | Owner. Every query is scoped to it. |
| `word` | String, ≤120 | Word in the learning language. |
| `meaning`, `example`, `exampleTranslation` | String, ≤500 | |
| `partOfSpeech` | String, ≤40 | |
| `sourceLanguage`, `targetLanguage` | String | Codes at the time of saving. |
| `learned` | Boolean, default false | |
| `reviewCount`, `lastReviewedAt` | Number, Date | Updated by the review endpoint. |
| `origin` | enum `lesson`, `ai`, `manual` | |

Indexes: `{ user: 1, targetLanguage: 1, word: 1 }` **unique** (prevents duplicates); `{ user: 1, learned: 1, lastReviewedAt: 1 }`.

### New: `UserReport` (collection `userreports`)

| Field | Type | Notes |
|---|---|---|
| `reporter`, `reported` | ObjectId → User | |
| `reason` | enum (see API) | |
| `details` | String, ≤1000 | |
| `status` | enum `open`, `reviewed`, `dismissed`, `actioned` | Default `open`. |
| `reviewedBy`, `reviewedAt` | ObjectId, Date | Set by the admin review endpoint. |

Indexes: `{ reporter: 1, reported: 1, status: 1 }` **partial unique** where `status` is `open` (one open report per reporter and target); `{ reported: 1, status: 1 }`; `{ status: 1, createdAt: -1 }`.

### Changed: `User`

| Field | Type | Default | Notes |
|---|---|---|---|
| `accountStatus` | enum `active`, `suspended` | `active` | Enforced in `protectRoute`. |
| `blockedUsers` | [ObjectId → User] | `[]` | Symmetric in effect: both sides are hidden and cannot send requests. |
| `learningGoals` | `{ dailyLessons: 1, dailyQuizzes: 1 }` | 1 and 1 | Range 0–10. |
| `lastSeenAt` | Date | null | Throttled to one write per 5 minutes per user. |

Indexes added: `{ lastSeenAt: -1 }`, `{ accountStatus: 1 }`.

Existing documents need no migration: defaults apply on read. Signup now requires a password of at least 8 characters (was 6).

### Reused without change

`QuizSession` also serves revision quizzes (kind `practice`). Its fields are unchanged.

### Index review

| Collection | Index | Purpose |
|---|---|---|
| `users` | `lastSeenAt` desc | Active-user counts |
| `users` | `accountStatus` | Admin filter |
| `savedwords` | `user, targetLanguage, word` unique | Duplicate prevention |
| `savedwords` | `user, learned, lastReviewedAt` | Review queue |
| `userreports` | partial unique `reporter, reported, status=open` | Duplicate open reports |
| `userreports` | `reported, status` | Reports against a user |
| `userreports` | `status, createdAt desc` | Admin review queue |

Query note: admin user search uses an unanchored regex on `fullName` and `email`, which cannot use an index. This is acceptable for an admin tool at current scale; for a large user base, add a text index or an anchored search.
