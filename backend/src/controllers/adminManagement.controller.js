// Administrator-only user management, moderation, and analytics.
// Every handler here is mounted behind protectRoute + adminOnly in adminLearning.route.js.
import mongoose from "mongoose";
import User from "../models/User.js";
import UserReport from "../models/UserReport.js";
import QuizAttempt from "../models/QuizAttempt.js";
import UserLessonProgress from "../models/UserLessonProgress.js";
import UserLanguageProgress from "../models/UserLanguageProgress.js";
import Language from "../models/Language.js";
import FriendRequest from "../models/FriendRequest.js";

const SAFE_USER_FIELDS = "fullName email nativeLanguage learningLanguage location role accountStatus isOnboarded lastSeenAt createdAt";
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const fail = (res, label, error) => {
  console.error(`${label} error:`, error.message);
  return res.status(500).json({ message: "Internal server error" });
};

// GET /api/admin/users?search=&status=&page=&limit=
export async function listUsers(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const limit = clampInt(req.query.limit, 1, 100, 20);
    const filter = {};
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      // Escaped and length-limited: user input never becomes a raw regex.
      const term = escapeRegex(req.query.search.trim().slice(0, 100));
      filter.$or = [{ fullName: { $regex: term, $options: "i" } }, { email: { $regex: term, $options: "i" } }];
    }
    if (req.query.status === "active" || req.query.status === "suspended") filter.accountStatus = req.query.status;

    const [items, total] = await Promise.all([
      User.find(filter).select(SAFE_USER_FIELDS).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return res.status(200).json({ items, page, limit, total, hasMore: page * limit < total });
  } catch (error) {
    return fail(res, "listUsers", error);
  }
}

// GET /api/admin/users/:id/activity
export async function userActivity(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid user id" });
    const user = await User.findById(id).select(SAFE_USER_FIELDS).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const [quizAttempts, lessonsCompleted, languages, friendCount, reportsAgainst, openRequests] = await Promise.all([
      QuizAttempt.countDocuments({ user: id }),
      UserLessonProgress.countDocuments({ user: id, isCompleted: true }),
      UserLanguageProgress.find({ user: id }).select("nativeLanguage targetLanguage unlockedLevels totalStars streak").lean(),
      User.findById(id).select("friends").lean().then((u) => u?.friends?.length ?? 0),
      UserReport.countDocuments({ reported: id }),
      FriendRequest.countDocuments({ $or: [{ sender: id }, { recipient: id }], status: "pending" }),
    ]);

    return res.status(200).json({
      user,
      activity: {
        lastSeenAt: user.lastSeenAt,
        quizAttempts,
        lessonsCompleted,
        friends: friendCount,
        pendingFriendRequests: openRequests,
        reportsAgainst,
        languages,
      },
    });
  } catch (error) {
    return fail(res, "userActivity", error);
  }
}

// PATCH /api/admin/users/:id/status  { accountStatus: "active" | "suspended" }
export async function setUserStatus(req, res) {
  try {
    const { id } = req.params;
    const { accountStatus } = req.body ?? {};
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid user id" });
    if (!["active", "suspended"].includes(accountStatus)) {
      return res.status(400).json({ message: "accountStatus must be active or suspended" });
    }
    if (String(id) === String(req.user._id)) {
      return res.status(400).json({ message: "You cannot change your own account status" });
    }
    const target = await User.findById(id).select("role").lean();
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.role === "admin" && accountStatus === "suspended") {
      return res.status(400).json({ message: "Administrator accounts cannot be suspended here. Change their role first." });
    }

    const updated = await User.findByIdAndUpdate(id, { $set: { accountStatus } }, { new: true }).select(SAFE_USER_FIELDS).lean();
    return res.status(200).json({ success: true, user: updated });
  } catch (error) {
    return fail(res, "setUserStatus", error);
  }
}

// GET /api/admin/reports?status=open&page=&limit=
export async function listReports(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const limit = clampInt(req.query.limit, 1, 100, 20);
    const filter = {};
    const allowed = ["open", "reviewed", "dismissed", "actioned"];
    if (allowed.includes(req.query.status)) filter.status = req.query.status;

    const [items, total] = await Promise.all([
      UserReport.find(filter)
        .populate("reporter", "fullName email")
        .populate("reported", "fullName email accountStatus")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      UserReport.countDocuments(filter),
    ]);
    return res.status(200).json({ items, page, limit, total, hasMore: page * limit < total });
  } catch (error) {
    return fail(res, "listReports", error);
  }
}

// PATCH /api/admin/reports/:id  { status: "reviewed" | "dismissed" | "actioned" }
export async function reviewReport(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid report id" });
    if (!["reviewed", "dismissed", "actioned"].includes(status)) {
      return res.status(400).json({ message: "status must be reviewed, dismissed, or actioned" });
    }
    const updated = await UserReport.findByIdAndUpdate(
      id,
      { $set: { status, reviewedBy: req.user._id, reviewedAt: new Date() } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: "Report not found" });
    return res.status(200).json({ success: true, report: updated });
  } catch (error) {
    return fail(res, "reviewReport", error);
  }
}

// GET /api/admin/analytics
export async function platformAnalytics(req, res) {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totalUsers, activeUsers7d, activeUsers24h, suspendedUsers, enrollment, lessonsCompleted, quizStats, activityByDay, openReports] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ lastSeenAt: { $gte: weekAgo } }),
        User.countDocuments({ lastSeenAt: { $gte: dayAgo } }),
        User.countDocuments({ accountStatus: "suspended" }),
        UserLanguageProgress.aggregate([
          { $group: { _id: { native: "$nativeLanguage", target: "$targetLanguage" }, learners: { $addToSet: "$user" } } },
          { $project: { native: "$_id.native", target: "$_id.target", learners: { $size: "$learners" }, _id: 0 } },
          { $sort: { learners: -1 } },
          { $limit: 50 },
        ]),
        UserLessonProgress.countDocuments({ isCompleted: true }),
        QuizAttempt.aggregate([
          {
            $group: {
              _id: "$type",
              attempts: { $sum: 1 },
              averageScore: { $avg: "$scorePercentage" },
              passed: { $sum: { $cond: ["$isPassed", 1, 0] } },
            },
          },
        ]),
        QuizAttempt.aggregate([
          { $match: { createdAt: { $gte: weekAgo } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, attempts: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        UserReport.countDocuments({ status: "open" }),
      ]);

    const quizPerformance = Object.fromEntries(
      quizStats.map((q) => [
        q._id,
        { attempts: q.attempts, averageScorePercent: q.averageScore == null ? null : Math.round(q.averageScore * 10) / 10, passRatePercent: q.attempts ? Math.round((q.passed / q.attempts) * 1000) / 10 : null },
      ])
    );

    return res.status(200).json({
      users: { total: totalUsers, active7Days: activeUsers7d, active24Hours: activeUsers24h, suspended: suspendedUsers },
      enrollmentByLanguagePair: enrollment,
      lessonsCompleted,
      quizPerformance,
      quizActivityLast7Days: activityByDay,
      openReports,
    });
  } catch (error) {
    return fail(res, "platformAnalytics", error);
  }
}

// Language list lookups for content validation.
export const activeLanguageCodes = async () => {
  const docs = await Language.find({ isActive: true }).select("code").lean();
  return new Set(docs.map((d) => d.code));
};
