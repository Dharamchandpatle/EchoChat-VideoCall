import { StreamChat } from "stream-chat";

let chatClientInstance = null;
let activeConnectionPromise = null;

/**
 * Thread-safe, StrictMode-resilient Stream Chat client connector
 */
export const getConnectedStreamChatClient = async (apiKey, user, token) => {
  if (!apiKey || !user?.id || !token) {
    throw new Error("Missing required Stream Chat connection credentials");
  }

  if (!chatClientInstance) {
    chatClientInstance = StreamChat.getInstance(apiKey, {
      enableWSFallback: true,
    });
  }

  const client = chatClientInstance;

  // 1. If already connected as this exact user, reuse immediately
  if (client.userID === user.id) {
    return client;
  }

  // 2. If connected as a different user, disconnect first
  if (client.userID && client.userID !== user.id) {
    await client.disconnectUser();
  }

  // 3. If a connection is already in progress, wait for it
  if (activeConnectionPromise) {
    await activeConnectionPromise;
    if (client.userID === user.id) return client;
  }

  // 4. Connect safely with a shared promise to prevent race conditions
  activeConnectionPromise = client
    .connectUser(user, token)
    .catch((err) => {
      console.error("Stream connectUser error:", err.message);
      // If error says already connected, ignore
      if (client.userID === user.id) {
        return client;
      }
      throw err;
    })
    .finally(() => {
      activeConnectionPromise = null;
    });

  await activeConnectionPromise;
  return client;
};

export const getStreamChatInstance = (apiKey) => {
  if (!chatClientInstance && apiKey) {
    chatClientInstance = StreamChat.getInstance(apiKey, {
      enableWSFallback: true,
    });
  }
  return chatClientInstance;
};
