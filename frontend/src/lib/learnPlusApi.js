import { axiosInstance } from "./axios";

// Vocabulary book
export const listVocabulary = async ({ mode, learned, page = 1, limit = 20 } = {}) => {
  const params = { page, limit };
  if (mode) params.mode = mode;
  if (learned !== undefined) params.learned = String(learned);
  return (await axiosInstance.get("/learning/vocabulary", { params })).data;
};
export const addVocabulary = async (body) => (await axiosInstance.post("/learning/vocabulary", body)).data;
export const updateVocabulary = async (id, body) => (await axiosInstance.patch(`/learning/vocabulary/${id}`, body)).data;
export const deleteVocabulary = async (id) => (await axiosInstance.delete(`/learning/vocabulary/${id}`)).data;
export const reviewVocabulary = async (id) => (await axiosInstance.post(`/learning/vocabulary/${id}/review`)).data;

// Goals, analytics, revision
export const getTodayGoals = async () => (await axiosInstance.get("/learning/goals/today")).data;
export const updateGoals = async (body) => (await axiosInstance.patch("/learning/goals", body)).data;
export const getAnalytics = async () => (await axiosInstance.get("/learning/analytics")).data;
export const getIncorrectAnswers = async () => (await axiosInstance.get("/learning/revision/incorrect")).data;
export const createRevisionQuiz = async () => (await axiosInstance.post("/learning/revision/quiz")).data;

// AI learning assistant
export const checkGrammar = async (text) => (await axiosInstance.post("/ai/grammar", { text })).data;
export const explainWord = async (word) => (await axiosInstance.post("/ai/explain-word", { word })).data;
export const practiceChat = async ({ message, history, difficulty, scenario }) =>
  (await axiosInstance.post("/ai/practice", { message, history, difficulty, scenario })).data;

// Social safety
export const blockUser = async (id) => (await axiosInstance.post(`/users/${id}/block`)).data;
export const reportUser = async (id, body) => (await axiosInstance.post(`/users/${id}/report`, body)).data;
export const removeFriend = async (id) => (await axiosInstance.delete(`/users/friends/${id}`)).data;
