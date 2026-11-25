import "dotenv/config";
import { StreamChat } from "stream-chat";

const apiKey = process.env.STREAM_API_KEY;
const apiSecret = process.env.STREAM_API_SECRET;
const TOKEN_TTL_SECONDS = 24 * 60 * 60; // Stream tokens expire after 24h

export const isStreamConfigured = Boolean(apiKey && apiSecret);

if (!isStreamConfigured) {
  console.warn("Stream API key or secret is missing; chat and video features are disabled.");
}

let streamClient = null;
const getClient = () => {
  if (!isStreamConfigured) throw new Error("Stream server credentials are missing");
  if (!streamClient) streamClient = StreamChat.getInstance(apiKey, apiSecret);
  return streamClient;
};

export const upsertStreamUsers = async (users) => {
  if (!users.length) return;
  await getClient().upsertUsers(users);
};

export const upsertStreamUser = async (userData) => {
  await upsertStreamUsers([userData]);
  return userData;
};

export const generateStreamToken = (userId) => {
  if (!userId) throw new Error("Stream user ID is missing");
  const nowSec = Math.floor(Date.now() / 1000);
  return getClient().createToken(userId.toString(), nowSec + TOKEN_TTL_SECONDS, nowSec - 5);
};
