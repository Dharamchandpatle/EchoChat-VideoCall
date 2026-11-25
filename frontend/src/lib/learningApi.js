import { axiosInstance } from "./axios";

// Languages
export const getLanguages = async () => {
  const res = await axiosInstance.get("/learning/languages");
  return res.data;
};

export const getUserSelection = async () => {
  const res = await axiosInstance.get("/learning/user-selection");
  return res.data;
};

export const selectLanguagePair = async (data) => {
  const res = await axiosInstance.post("/learning/select-language", data);
  return res.data;
};

// Dashboard & Categories
export const getLearningDashboard = async () => {
  const res = await axiosInstance.get("/learning/dashboard");
  return res.data;
};

export const getCategories = async (level) => {
  const res = await axiosInstance.get("/learning/categories", {
    params: level ? { level } : {},
  });
  return res.data;
};

// Lessons
export const getLessonDetails = async (categoryId) => {
  const res = await axiosInstance.get(`/learning/lessons/${categoryId}`);
  return res.data;
};

export const completeLesson = async (lessonId) => {
  const res = await axiosInstance.post(`/learning/lessons/${lessonId}/complete`);
  return res.data;
};

// Practice Quiz
export const getPracticeQuiz = async (categoryId) => {
  const res = await axiosInstance.get(`/learning/quiz/${categoryId}`);
  return res.data;
};

export const submitPracticeQuiz = async (data) => {
  const res = await axiosInstance.post("/learning/quiz/submit", data);
  return res.data;
};

// Level Assessments
export const getLevelAssessment = async (level) => {
  const res = await axiosInstance.get(`/learning/assessment/${level}`);
  return res.data;
};

export const submitLevelAssessment = async (data) => {
  const res = await axiosInstance.post("/learning/assessment/submit", data);
  return res.data;
};

export const getAssessmentResult = async (attemptId) => {
  const res = await axiosInstance.get(`/learning/assessment-result/${attemptId}`);
  return res.data;
};

// User Profile & Achievements
export const getUserLearningProfile = async () => {
  const res = await axiosInstance.get("/learning/progress");
  return res.data;
};

// Admin
export const getAdminStats = async () => {
  const res = await axiosInstance.get("/admin/learning/stats");
  return res.data;
};

export const triggerAdminSeed = async () => {
  const res = await axiosInstance.post("/admin/learning/seed");
  return res.data;
};

export const claimAdminRole = async () => {
  const res = await axiosInstance.post("/admin/learning/claim-admin");
  return res.data;
};
