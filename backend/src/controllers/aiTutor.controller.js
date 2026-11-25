import { TutorError, correctGrammar, explainWord, practiceReply, suggestReplies } from "../services/aiTutor.service.js";
import { resolveLanguage } from "../lib/supportedLanguages.js";

// Each handler gets the caller's pair from the request body or from the saved profile.
const profilePair = (user) => ({
  learningLanguage: user?.learningLanguage || "",
  nativeLanguage: user?.nativeLanguage || "",
});

const respondWith = (res, fn) =>
  fn().then(
    (data) => res.status(200).json({ success: true, ...data }),
    (error) => {
      if (error instanceof TutorError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      console.error("AI tutor error:", error.message);
      return res.status(503).json({ message: "AI service is temporarily unavailable", code: "PROVIDER_ERROR" });
    }
  );

// Profile languages are used unless the body provides valid ones (lets a user try another pair).
const resolvePairFromBody = (req) => {
  const fallback = profilePair(req.user);
  const body = req.body ?? {};
  const learning = typeof body.learningLanguage === "string" && resolveLanguage(body.learningLanguage) ? body.learningLanguage : fallback.learningLanguage;
  const native = typeof body.nativeLanguage === "string" && resolveLanguage(body.nativeLanguage) ? body.nativeLanguage : fallback.nativeLanguage;
  return { learningLanguage: learning, nativeLanguage: native };
};

export const grammarCheck = (req, res) =>
  respondWith(res, () => correctGrammar({ text: req.body?.text, ...resolvePairFromBody(req) }));

export const wordExplanation = (req, res) =>
  respondWith(res, () => explainWord({ word: req.body?.word, ...resolvePairFromBody(req) }));

export const conversationPractice = (req, res) =>
  respondWith(res, () =>
    practiceReply({
      message: req.body?.message,
      history: req.body?.history,
      difficulty: req.body?.difficulty,
      scenario: req.body?.scenario,
      ...resolvePairFromBody(req),
    })
  );

// Suggestions are returned to the client only. Nothing is sent to the chat automatically.
export const smartReplies = (req, res) =>
  respondWith(res, () => suggestReplies({ messages: req.body?.messages, ...resolvePairFromBody(req) }));
