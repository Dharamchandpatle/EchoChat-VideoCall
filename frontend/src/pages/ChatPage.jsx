import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useParams } from "react-router";
import { StreamChat } from "stream-chat";
import {
    Channel,
    ChannelHeader,
    Chat,
    MessageInput,
    MessageList,
    Thread,
    Window,
} from "stream-chat-react";

import CallButton from "../components/CallButton";
import ChatLoader from "../components/ChatLoader";
import useAuthUser from "../hooks/useAuthUser";
import { getStreamToken, syncStreamUser } from "../lib/api";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;
const streamClient = StreamChat.getInstance(STREAM_API_KEY, {
  enableWSFallback: true,
});

const ChatPage = () => {
  const { id: targetUserId } = useParams();
  const { authUser } = useAuthUser();
  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const initializationRef = useRef(null);

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
    retry: false,
  });

  const userId = authUser?._id?.toString();
  const userName = authUser?.fullName;
  const profileImage = authUser?.profilePic;
  const token = tokenData?.token;

  useEffect(() => {
    if (!token || !userId || !targetUserId || !STREAM_API_KEY) return;

    let cancelled = false;
    const initializeChat = async () => {
      console.log("Initializing stream chat client...");
      console.log("Stream API key exists:", Boolean(STREAM_API_KEY));
      console.log("Stream token exists:", Boolean(token));
      console.log("Stream user ID:", userId);

      await streamClient.connectUser(
        { id: userId, name: userName, image: profileImage },
        token
      );
      console.log("Stream Chat connected successfully");
      console.log("Stream client connected:", streamClient.wsConnection?.isHealthy);

      const targetId = targetUserId.toString();
      const channelId = [userId, targetId].sort().join("-");
      await syncStreamUser(targetId);
      const currentChannel = streamClient.channel("messaging", channelId, {
        members: [userId, targetId],
      });
      await currentChannel.watch();
      return currentChannel;
    };

    const initialization = initializationRef.current || initializeChat();
    initializationRef.current = initialization;

    initialization.then((currentChannel) => {
      if (!cancelled) {
        setChatClient(streamClient);
        setChannel(currentChannel);
        setLoading(false);
      }
    }).catch((connectionError) => {
      console.error("Stream Chat connection failed:", connectionError);
      if (!cancelled) {
        setError(true);
        setLoading(false);
        toast.error("Unable to connect to chat. Please try again.");
      }
    }).finally(() => {
      if (initializationRef.current === initialization) {
        initializationRef.current = null;
      }
    });

    return () => {
      cancelled = true;
      if (streamClient.userID === userId && !initializationRef.current) {
        void streamClient.disconnectUser();
      }
    };
  }, [profileImage, targetUserId, token, userId, userName, retryCount]);

  const handleRetry = () => {
    setError(false);
    setLoading(true);
    setChatClient(null);
    setChannel(null);
    setRetryCount((count) => count + 1);
  };

  const handleVideoCall = () => {
    if (channel) {
      const callUrl = `${window.location.origin}/call/${channel.id}`;
      channel.sendMessage({ text: `I've started a video call. Join me here: ${callUrl}` });
      toast.success("Video call link sent successfully!");
    }
  };

  if (loading || !chatClient || !channel) {
    return <ChatLoader error={error} onRetry={handleRetry} />;
  }

  return (
    <div className="h-[93vh]">
      <Chat client={chatClient}>
        <Channel channel={channel}>
          <div className="w-full relative">
            <CallButton handleVideoCall={handleVideoCall} />
            <Window>
              <ChannelHeader />
              <MessageList />
              <MessageInput focus />
            </Window>
          </div>
          <Thread />
        </Channel>
      </Chat>
    </div>
  );
};

export default ChatPage;
