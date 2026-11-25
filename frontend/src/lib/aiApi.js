import { axiosInstance } from "./axios";

// Real provider check, cached by the server. refresh=true asks for a new probe (rate-limited server-side).
export const getAiHealth = async (refresh = false) => {
  const res = await axiosInstance.get("/ai/health", { params: refresh ? { refresh: "true" } : {} });
  return res.data;
};
