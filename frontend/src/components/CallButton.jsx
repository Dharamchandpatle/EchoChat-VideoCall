import { VideoIcon } from "lucide-react";

function CallButton({ handleVideoCall }) {
  return (
    <div className="absolute right-4 top-3.5 z-20 pointer-events-auto">
      <button
        onClick={handleVideoCall}
        className="btn btn-success btn-sm text-white gap-1 shadow-sm hover:scale-105 transition-transform"
        title="Start Video Call"
      >
        <VideoIcon className="size-4" />
        <span className="hidden sm:inline text-xs">Video Call</span>
      </button>
    </div>
  );
}

export default CallButton;