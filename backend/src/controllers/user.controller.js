import mongoose from "mongoose";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import { isBlockedEitherWay } from "./moderation.controller.js";

// Public fields only. Never include password, email, role, or internal flags.
const PUBLIC_USER_FIELDS = "fullName profilePic nativeLanguage learningLanguage location bio";
const RECOMMENDATION_LIMIT = 50;

const isValidId = (id) => mongoose.isValidObjectId(id);

export async function getRecommendedUsers(req, res) {
  try {
    const me = req.user;

    // Exclude self, existing friends, and anyone with a pending request in either direction.
    const pending = await FriendRequest.find({
      status: "pending",
      $or: [{ sender: me._id }, { recipient: me._id }],
    })
      .select("sender recipient")
      .lean();
    const pendingIds = pending.map((r) =>
      r.sender.toString() === me._id.toString() ? r.recipient : r.sender
    );

    // Hide users I blocked and users who blocked me.
    const blockedByOthers = await User.find({ blockedUsers: me._id }).select("_id").lean();
    const hiddenIds = [...me.blockedUsers, ...blockedByOthers.map((u) => u._id)];

    const recommendedUsers = await User.find({
      _id: { $nin: [me._id, ...me.friends, ...pendingIds, ...hiddenIds] },
      isOnboarded: true,
    })
      .select(PUBLIC_USER_FIELDS)
      .limit(RECOMMENDATION_LIMIT)
      .lean();

    return res.status(200).json(recommendedUsers);
  } catch (error) {
    console.error("Error in getRecommendedUsers controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getMyFriends(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select("friends")
      .populate("friends", PUBLIC_USER_FIELDS)
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json(user.friends);
  } catch (error) {
    console.error("Error in getMyFriends controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function sendFriendRequest(req, res) {
  try {
    const myId = req.user._id.toString();
    const { id: recipientId } = req.params;

    if (!isValidId(recipientId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (myId === recipientId) {
      return res.status(400).json({ message: "You can't send a friend request to yourself" });
    }

    const recipient = await User.findById(recipientId).select("friends isOnboarded").lean();
    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found" });
    }
    if (await isBlockedEitherWay(myId, recipientId)) {
      // Generic wording: do not reveal whether a block exists.
      return res.status(403).json({ message: "You can't send a friend request to this user" });
    }

    if (recipient.friends.some((f) => f.toString() === myId)) {
      return res.status(400).json({ message: "You are already friends with this user" });
    }

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: myId, recipient: recipientId },
        { sender: recipientId, recipient: myId },
      ],
    }).lean();

    if (existingRequest) {
      const msg =
        existingRequest.status === "accepted"
          ? "You are already friends with this user"
          : "A friend request already exists between you and this user";
      return res.status(400).json({ message: msg });
    }

    const friendRequest = await FriendRequest.create({ sender: myId, recipient: recipientId });
    return res.status(201).json(friendRequest);
  } catch (error) {
    // Unique (sender, recipient) index caught a concurrent duplicate.
    if (error?.code === 11000) {
      return res.status(400).json({ message: "A friend request already exists between you and this user" });
    }
    console.error("Error in sendFriendRequest controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function acceptFriendRequest(req, res) {
  const { id: requestId } = req.params;
  if (!isValidId(requestId)) {
    return res.status(400).json({ message: "Invalid request id" });
  }

  let claimed = null;
  try {
    const existing = await FriendRequest.findById(requestId).select("recipient").lean();
    if (!existing) return res.status(404).json({ message: "Friend request not found" });
    if (existing.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to accept this request" });
    }

    // Guarded transition: only the recipient can accept, and only while pending.
    claimed = await FriendRequest.findOneAndUpdate(
      { _id: requestId, recipient: req.user._id, status: "pending" },
      { status: "accepted" },
      { new: true }
    );

    if (!claimed) {
      const exists = await FriendRequest.exists({ _id: requestId });
      if (!exists) return res.status(404).json({ message: "Friend request not found" });
      return res.status(409).json({ message: "This friend request is no longer pending" });
    }

    // Both sides in one bulk write; $addToSet keeps the operation idempotent.
    await User.bulkWrite([
      {
        updateOne: {
          filter: { _id: claimed.sender },
          update: { $addToSet: { friends: claimed.recipient } },
        },
      },
      {
        updateOne: {
          filter: { _id: claimed.recipient },
          update: { $addToSet: { friends: claimed.sender } },
        },
      },
    ]);

    return res.status(200).json({ message: "Friend request accepted" });
  } catch (error) {
    // Roll the request back to pending so the state stays consistent if friend writes failed.
    if (claimed) {
      await FriendRequest.updateOne({ _id: claimed._id }, { status: "pending" }).catch(() => {});
    }
    console.error("Error in acceptFriendRequest controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

// Recipient declines: the request document is removed so either side can re-request later.
export async function rejectFriendRequest(req, res) {
  const { id: requestId } = req.params;
  if (!isValidId(requestId)) {
    return res.status(400).json({ message: "Invalid request id" });
  }

  try {
    const request = await FriendRequest.findById(requestId).lean();
    if (!request) return res.status(404).json({ message: "Friend request not found" });
    if (request.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to reject this request" });
    }
    if (request.status !== "pending") {
      return res.status(409).json({ message: "Only pending requests can be rejected" });
    }

    await FriendRequest.deleteOne({ _id: requestId, status: "pending" });
    return res.status(200).json({ message: "Friend request rejected" });
  } catch (error) {
    console.error("Error in rejectFriendRequest controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

// Sender withdraws a pending request.
export async function cancelFriendRequest(req, res) {
  const { id: requestId } = req.params;
  if (!isValidId(requestId)) {
    return res.status(400).json({ message: "Invalid request id" });
  }

  try {
    const request = await FriendRequest.findById(requestId).lean();
    if (!request) return res.status(404).json({ message: "Friend request not found" });
    if (request.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to cancel this request" });
    }
    if (request.status !== "pending") {
      return res.status(409).json({ message: "Only pending requests can be cancelled" });
    }

    await FriendRequest.deleteOne({ _id: requestId, status: "pending" });
    return res.status(200).json({ message: "Friend request cancelled" });
  } catch (error) {
    console.error("Error in cancelFriendRequest controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getFriendRequests(req, res) {
  try {
    const [incomingReqs, acceptedReqs] = await Promise.all([
      FriendRequest.find({ recipient: req.user._id, status: "pending" })
        .populate("sender", PUBLIC_USER_FIELDS)
        .lean(),
      FriendRequest.find({ sender: req.user._id, status: "accepted" })
        .populate("recipient", "fullName profilePic")
        .lean(),
    ]);

    return res.status(200).json({ incomingReqs, acceptedReqs });
  } catch (error) {
    console.error("Error in getFriendRequests controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getOutgoingFriendReqs(req, res) {
  try {
    const outgoingRequests = await FriendRequest.find({ sender: req.user._id, status: "pending" })
      .populate("recipient", PUBLIC_USER_FIELDS)
      .lean();

    return res.status(200).json(outgoingRequests);
  } catch (error) {
    console.error("Error in getOutgoingFriendReqs controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
