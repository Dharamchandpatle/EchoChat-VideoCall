import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { getAiHealth } from "../lib/aiApi";

// Status from the real provider check on the server (not from the presence of a key).
// Each status has its own message, so the UI never hides a failure behind a generic label.
const STATUS_VIEW = {
  available: { label: "AI Available", tone: "badge-success", hint: "" },
  not_configured: { label: "AI Not Configured", tone: "badge-ghost", hint: "The server has no Gemini key yet." },
  invalid_credentials: { label: "Invalid Gemini Credentials", tone: "badge-error", hint: "The administrator needs to update the API key." },
  model_unavailable: { label: "AI Model Unavailable", tone: "badge-error", hint: "The configured model is not available to this key." },
  quota_exceeded: { label: "Rate Limit Reached", tone: "badge-warning", hint: "Try again in a few minutes." },
  provider_unavailable: { label: "AI Provider Temporarily Unavailable", tone: "badge-warning", hint: "This is usually temporary." },
  network_error: { label: "Cannot Reach AI Provider", tone: "badge-warning", hint: "The server could not connect to Google." },
};

const AiStatusBadge = () => {
  const queryClient = useQueryClient();
  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: ["aiHealth"],
    queryFn: () => getAiHealth(false),
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: true,
    // Keep checking while AI is not available, so the badge recovers without a page reload.
    refetchInterval: (query) => (query.state.data?.status === "available" ? false : 60 * 1000),
  });

  const refreshNow = async () => {
    const fresh = await getAiHealth(true);
    queryClient.setQueryData(["aiHealth"], fresh);
  };

  if (isPending) {
    return <span className="badge badge-ghost badge-sm" role="status">Checking AI…</span>;
  }

  if (isError) {
    return (
      <span className="inline-flex items-center gap-1" role="status">
        <span className="badge badge-ghost badge-sm">AI status unknown</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => queryClient.invalidateQueries({ queryKey: ["aiHealth"] })}>
          Retry
        </button>
      </span>
    );
  }

  const view = STATUS_VIEW[data.status] || { label: "AI Status Unknown", tone: "badge-ghost", hint: data.message || "" };
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="status" aria-live="polite">
      <span className={`badge ${view.tone} badge-sm`} title={data.message || view.hint}>{view.label}</span>
      {view.hint && data.status !== "available" && <span className="text-xs opacity-70">{view.hint}</span>}
      <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={refreshNow} disabled={isFetching} aria-label="Check AI status again">
        <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Check again
      </button>
    </span>
  );
};

export default AiStatusBadge;
