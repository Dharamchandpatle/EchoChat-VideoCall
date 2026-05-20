import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const chatWithAI = async (req, res) => {
  try {
    const { message, language = "en" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

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
    console.error("AI Chat Error:", error);
    res.status(500).json({
      error: "Failed to process your message",
      details: error.message,
    });
  }
};

export const translateText = async (req, res) => {
  try {
    const { text, targetLanguage = "en", sourceLanguage = "auto" } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

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
    console.error("Translation Error:", error);
    res.status(500).json({
      error: "Failed to translate text",
      details: error.message,
    });
  }
};

export const detectLanguage = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

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
    console.error("Language Detection Error:", error);
    res.status(500).json({
      error: "Failed to detect language",
      details: error.message,
    });
  }
};
