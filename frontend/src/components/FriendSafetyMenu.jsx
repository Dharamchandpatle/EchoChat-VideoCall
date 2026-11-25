import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, MoreVertical, ShieldBan, UserMinus } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { blockUser, removeFriend, reportUser } from "../lib/learnPlusApi";

const REASONS = [
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Something else" },
];

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

// Friend actions: remove, block, and report. Destructive actions ask for confirmation first.
const FriendSafetyMenu = ({ friendId, friendName }) => {
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("harassment");
  const [details, setDetails] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["friends"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  const remove = useMutation({
    mutationFn: () => removeFriend(friendId),
    onSuccess: () => {
      toast.success(`${friendName} was removed from your friends`);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, "Could not remove this friend")),
  });
  const block = useMutation({
    mutationFn: () => blockUser(friendId),
    onSuccess: () => {
      toast.success(`${friendName} is blocked`);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, "Could not block this user")),
  });
  const report = useMutation({
    mutationFn: () => reportUser(friendId, { reason, details: details.trim() }),
    onSuccess: (data) => {
      toast.success(data.message || "Report submitted");
      setReportOpen(false);
      setDetails("");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not submit the report")),
  });

  const closeMenu = (e) => e.currentTarget.closest("details")?.removeAttribute("open");

  return (
    <>
      <details className="dropdown dropdown-end">
        <summary className="btn btn-ghost btn-xs btn-square list-none" aria-label={`More actions for ${friendName}`}>
          <MoreVertical className="size-4" aria-hidden="true" />
        </summary>
        <ul className="dropdown-content menu menu-sm bg-base-100 rounded-box z-20 w-48 p-2 shadow-lg border border-base-300">
          <li>
            <button
              type="button"
              onClick={(e) => {
                closeMenu(e);
                if (window.confirm(`Remove ${friendName} from your friends?`)) remove.mutate();
              }}
              disabled={remove.isPending}
            >
              <UserMinus className="size-4" aria-hidden="true" /> Remove friend
            </button>
          </li>
          <li>
            <button
              type="button"
              className="text-error"
              onClick={(e) => {
                closeMenu(e);
                if (window.confirm(`Block ${friendName}? You will no longer see each other, and the friendship ends.`)) block.mutate();
              }}
              disabled={block.isPending}
            >
              <ShieldBan className="size-4" aria-hidden="true" /> Block
            </button>
          </li>
          <li>
            <button type="button" onClick={(e) => { closeMenu(e); setReportOpen(true); }}>
              <Flag className="size-4" aria-hidden="true" /> Report
            </button>
          </li>
        </ul>
      </details>

      {reportOpen && (
        <div className="modal modal-open" role="dialog" aria-modal="true" aria-labelledby={`report-${friendId}`}>
          <form
            className="modal-box space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              report.mutate();
            }}
          >
            <h2 id={`report-${friendId}`} className="font-bold text-lg">Report {friendName}</h2>
            <label className="form-control">
              <span className="label-text text-sm mb-1">Reason</span>
              <select className="select select-bordered select-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text text-sm mb-1">Details (optional)</span>
              <textarea className="textarea textarea-bordered" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
            </label>
            <p className="text-xs opacity-60">Reports are reviewed by administrators. Misuse of reporting may lead to action.</p>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReportOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-error btn-sm" disabled={report.isPending}>Submit report</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default FriendSafetyMenu;
