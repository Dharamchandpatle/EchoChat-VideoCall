import "dotenv/config";
import { StreamChat } from "stream-chat";

const apiKey = process.env.STREAM_API_KEY;
const apiSecret = process.env.STREAM_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error("Stream API key or Secret is missing");
}

const streamClient = StreamChat.getInstance(apiKey, apiSecret);

export const upsertStreamUsers = async (users) => {
  if (!apiKey || !apiSecret) throw new Error("Stream server credentials are missing");
  if (!users.length) return;

  await streamClient.upsertUsers(users);
};

export const upsertStreamUser = async (userData) => {
  await upsertStreamUsers([userData]);
  return userData;
};

export const generateStreamToken = (userId) => {
  if (!apiKey || !apiSecret) throw new Error("Stream server credentials are missing");
  if (!userId) throw new Error("Stream user ID is missing");

  return streamClient.createToken(userId.toString());
};