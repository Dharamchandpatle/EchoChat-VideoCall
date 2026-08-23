import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = "gemini-3.7-flash";

const sendAIError = (res, error, operation) => {
  console.error(`${operation} Error:`, error);

  if (error?.status === 403) {
    return res.status(503).json({
      error: "AI service unavailable. Replace the revoked Gemini API key.",
    });
  }

  return res.status(503).json({
    error: "AI service temporarily unavailable",
  });
};

export const chatWithAI = async (req, res) => {
  try {
    const { message, language = "en" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    // Create a prompt for language detection and translation
    const systemPrompt = `You are a helpful assistant that can:
1. Understand queries in any language
2. Translate text between languages
3. Provide helpful responses

When responding:
- First, identify the language of the user's message
- If it's not in English, provide a translation
- Answer the query in the same language the user used
- Be concise and helpful

User message: "${message}"
User's preferred language: "${language}"`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const aiResponse = response.text();

    res.json({
      success: true,
      userMessage: message,
      aiResponse: aiResponse,
      detectedLanguage: language,
    });
  } catch (error) {
    sendAIError(res, error, "AI Chat");
  }
};

export const translateText = async (req, res) => {
  try {
    const { text, targetLanguage = "en", sourceLanguage = "auto" } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt =
      sourceLanguage === "auto"
        ? `Translate the following text to ${targetLanguage}. Only provide the translation, nothing else:\n\n${text}`
        : `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Only provide the translation, nothing else:\n\n${text}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const translation = response.text();

    res.json({
      success: true,
      originalText: text,
      translatedText: translation,
      targetLanguage: targetLanguage,
    });
  } catch (error) {
    sendAIError(res, error, "Translation");
  }
};

export const detectLanguage = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `Detect the language of the following text and respond with ONLY the language code (e.g., 'en', 'es', 'fr', 'de', etc.) and language name:\n\n${text}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const detection = response.text();

    res.json({
      success: true,
      text: text,
      detection: detection,
    });
  } catch (error) {
    sendAIError(res, error, "Language Detection");
  }
};
