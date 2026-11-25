import { axiosInstance } from "./axios";

// Translate one message. sourceLanguage omitted means auto-detect.
export const translateMessage = async ({ text, targetLanguage, sourceLanguage }) => {
  const body = { text, targetLanguage };
  if (sourceLanguage) body.sourceLanguage = sourceLanguage;
  const res = await axiosInstance.post("/ai/translate", body);
  return res.data;
};

export const updateTranslationPreferences = async (data) => {
  const res = await axiosInstance.patch("/auth/translation-preferences", data);
  return res.data;
};

export const updateLanguageProfile = async (data) => {
  const res = await axiosInstance.patch("/auth/profile", data);
  return res.data;
};
