import mongoose from "mongoose";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import UserReport, { REPORT_REASONS } from "../models/UserReport.js";

const PUBLIC_FIELDS = "fullName profilePic nativeLanguage learningLanguage location bio";

const validId = (id) => mongoose.isValidObjectId(id);
const sameId = (a, b) => String(a) === String(b);

// True when either account has blocked the other.
export const isBlockedEitherWay = async (userIdA, userIdB) => {
  const found = await User.exists({
    $or: [
      { _id: userIdA, blockedUsers: userIdB },
      { _id: userIdB, blockedUsers: userIdA },
    ],
  });
  return Boolean(found);
};

export async function blockUser(req, res) {
  try {
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ message: "Invalid user id" });
    if (sameId(id, req.user._id)) return res.status(400).json({ message: "You cannot block yourself" });

    const target = await User.exists({ _id: id });
    if (!target) return res.status(404).json({ message: "User not found" });

    await User.updateOne({ _id: req.user._id }, { $addToSet: { blockedUsers: id } });
    // Blocking ends any friendship and removes pending requests in either direction.
    await User.updateOne({ _id: req.user._id }, { $pull: { friends: id } });
    await User.updateOne({ _id: id }, { $pull: { friends: req.user._id } });
    await FriendRequest.deleteMany({
      $or: [
        { sender: req.user._id, recipient: id },
        { sender: id, recipient: req.user._id },
      ],
    });

    return res.status(200).json({ success: true, message: "User blocked" });
  } catch (error) {
    console.error("blockUser error:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function unblockUser(req, res) {
  try {
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ message: "Invalid user id" });
    await User.updateOne({ _id: req.user._id }, { $pull: { blockedUsers: id } });
    return res.status(200).json({ success: true, message: "User unblocked" });
  } catch (error) {
    console.error("unblockUser error:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getBlockedUsers(req, res) {
  try {
    const me = await User.findById(req.user._id).select("blockedUsers").populate("blockedUsers", PUBLIC_FIELDS).lean();
    return res.status(200).json(me?.blockedUsers ?? []);
  } catch (error) {
    console.error("getBlockedUsers error:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function reportUser(req, res) {
  try {
    const { id } = req.params;
    const { reason, details } = req.body ?? {};
    if (!validId(id)) return res.status(400).json({ message: "Invalid user id" });
    if (sameId(id, req.user._id)) return res.status(400).json({ message: "You cannot report yourself" });
    if (!REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ message: `reason must be one of: ${REPORT_REASONS.join(", ")}` });
    }
    if (details !== undefined && (typeof details !== "string" || details.length > 1000)) {
      return res.status(400).json({ message: "details must be text of 1000 characters or fewer" });
    }
    const target = await User.exists({ _id: id });
    if (!target) return res.status(404).json({ message: "User not found" });

    try {
      await UserReport.create({
        reporter: req.user._id,
        reported: id,
        reason,
        details: (details || "").trim(),
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ message: "You already have an open report for this user" });
      }
      throw error;
    }
    return res.status(201).json({ success: true, message: "Report submitted. Thank you for helping keep EchoChat safe." });
  } catch (error) {
    console.error("reportUser error:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function removeFriend(req, res) {
  try {
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ message: "Invalid user id" });

    const me = await User.findById(req.user._id).select("friends").lean();
    const isFriend = (me?.friends ?? []).some((f) => sameId(f, id));
    if (!isFriend) return res.status(404).json({ message: "This user is not in your friends list" });

    await User.updateOne({ _id: req.user._id }, { $pull: { friends: id } });
    await User.updateOne({ _id: id }, { $pull: { friends: req.user._id } });
    // Remove the accepted request so either side can send a new one later.
    await FriendRequest.deleteMany({
      status: "accepted",
      $or: [
        { sender: req.user._id, recipient: id },
        { sender: id, recipient: req.user._id },
      ],
    });
    return res.status(200).json({ success: true, message: "Friend removed" });
  } catch (error) {
    console.error("removeFriend error:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
