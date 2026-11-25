import mongoose from "mongoose";

export const REPORT_REASONS = ["harassment", "spam", "inappropriate_content", "impersonation", "other"];

// A user-submitted report about another user. Reviewed by administrators only.
const userReportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reported: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: ["open", "reviewed", "dismissed", "actioned"], default: "open" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A reporter can have one open report per target; duplicates are rejected.
userReportSchema.index(
  { reporter: 1, reported: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "open" } }
);
userReportSchema.index({ reported: 1, status: 1 });
userReportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("UserReport", userReportSchema);
