import { useQuery } from "@tanstack/react-query";
import { Globe, Languages, Settings, Sparkles, Video, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router";
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
import TranslatableMessage from "../components/TranslatableMessage";
import TranslationSettingsModal from "../components/TranslationSettingsModal";
import useAuthUser from "../hooks/useAuthUser";
import useTranslationPreferences from "../hooks/useTranslationPreferences";
import { getStreamToken, syncStreamUser } from "../lib/api";
import { getConnectedStreamChatClient } from "../lib/streamClientManager";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;


const ChatPage = () => {
  const { id: targetUserId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthUser();

  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const translationPrefs = useTranslationPreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
    retry: 2,
  });

  const userId = authUser?._id?.toString();
  const userName = authUser?.fullName || "EchoChat User";
  const profileImage = authUser?.profilePic || "";
  const token = tokenData?.token;


  useEffect(() => {
    // 1. Guard against self-chat
    if (userId && targetUserId && userId === targetUserId) {
      toast.error("You cannot initiate a chat conversation with yourself.");
      navigate("/");
      return;
    }

    if (!token || !userId || !targetUserId || !STREAM_API_KEY) return;

    let isSubscribed = true;

    const connectAndWatch = async () => {
      try {
        setLoading(true);
        setError(false);

        // 2. Connect client safely via singleton manager (handles StrictMode & concurrency)
        const client = await getConnectedStreamChatClient(
          STREAM_API_KEY,
          { id: userId, name: userName, image: profileImage },
          token
        );

        if (!isSubscribed) return;

        // 3. Ensure target user is synced to Stream (non-fatal if already created)
        const targetId = targetUserId.toString();
        try {
          await syncStreamUser(targetId);
        } catch (syncErr) {
          console.warn("Target user Stream sync warning:", syncErr.message);
        }

        if (!isSubscribed) return;

        // 4. Create deterministic 1-on-1 channel ID (sorted alphabetically)
        const channelId = [userId, targetId].sort().join("-");
        const chatChannel = client.channel("messaging", channelId, {
          members: [userId, targetId],
        });

        await chatChannel.watch();

        if (isSubscribed) {
          setChatClient(client);
          setChannel(chatChannel);
          setLoading(false);
        }
      } catch (err) {
        console.error("Stream Chat connection error:", err);
        if (isSubscribed) {
          setError(true);
          setLoading(false);
          toast.error("Unable to connect to chat. Please click Retry.");
        }
      }
    };

    connectAndWatch();

    return () => {
      isSubscribed = false;
    };
  }, [userId, targetUserId, token, userName, profileImage, retryCount, navigate]);

  const handleRetry = () => {
    setError(false);
    setLoading(true);
    setRetryCount((prev) => prev + 1);
  };

  const handleVideoCall = () => {
    if (channel) {
      const callUrl = `${window.location.origin}/call/${channel.id}`;
      channel.sendMessage({
        text: `📞 I've started a video call! Join me here: ${callUrl}`,
      });
      toast.success("Video call invite sent!");
      // Automatically navigate caller to the video call room
      navigate(`/call/${channel.id}`);
    }
  };

  if (loading || !chatClient || !channel) {
    return <ChatLoader error={error} onRetry={handleRetry} />;
  }

  return (
    <div className="h-[92vh] flex flex-col bg-base-100">
      {/* Chat toolbar: per-user translation summary and settings */}
      <div className="bg-base-200 border-b border-base-300 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs z-10 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Languages className="size-4" aria-hidden="true" />
          </div>
          <span className="font-semibold text-base-content truncate">
            Translate messages to {translationPrefs.target?.name}
          </span>
          {translationPrefs.autoTranslate && <span className="badge badge-primary badge-xs">Auto</span>}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="btn btn-ghost btn-xs gap-1"
          >
            <Settings className="size-3.5" aria-hidden="true" /> Translation settings
          </button>
        </div>

        {/* Quick Direct Video Call Launcher */}
        <button
          onClick={handleVideoCall}
          className="btn btn-primary btn-xs gap-1 shadow-sm font-semibold"
          title="Start Video Call with this user"
        >
          <Video className="size-3.5" /> Start Call
        </button>
      </div>

      <TranslationSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Stream Chat Window with Custom TranslatableMessage */}
      <div className="flex-1 relative overflow-hidden">
        <Chat client={chatClient}>
          <Channel channel={channel} Message={TranslatableMessage}>
            <div className="w-full h-full relative">
              <CallButton handleVideoCall={handleVideoCall} />
              <Window>
                <ChannelHeader />
                <MessageList Message={TranslatableMessage} />
                <MessageInput focus />
              </Window>
            </div>
            <Thread />
          </Channel>
        </Chat>
      </div>
    </div>
  );
};

export default ChatPage;
