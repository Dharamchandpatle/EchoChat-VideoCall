import mongoose from "mongoose";
import { generateStreamToken, isStreamConfigured, upsertStreamUser, upsertStreamUsers } from "../lib/stream.js";
import User from "../models/User.js";

export async function getStreamToken(req, res) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Authenticated user is required" });
    }

    if (!isStreamConfigured) {
      return res.status(503).json({ message: "Chat service is not configured on the server" });
    }

    const userId = req.user._id.toString();
    const token = generateStreamToken(userId);

    // Ensure the current user is upserted to Stream
    try {
      await upsertStreamUser({
        id: userId,
        name: req.user.fullName,
        image: req.user.profilePic || "",
      });
    } catch (upsertError) {
      console.warn("Stream upsert warning in getStreamToken:", upsertError.message);
    }

    res.status(200).json({ token });
  } catch (error) {
    console.error("Error in getStreamToken controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function syncStreamUser(req, res) {
  try {
    const targetId = req.params.id;
    const isSelf = targetId === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    const isFriend = (req.user.friends || []).some((f) => f.toString() === targetId);
    if (!isSelf && !isAdmin && !isFriend) {
      return res.status(403).json({ message: "You can only sync yourself or your friends" });
    }
    if (!mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findById(targetId).select("_id fullName profilePic");

    if (!user) return res.status(404).json({ message: "User not found" });

    await upsertStreamUsers([
      {
        id: user._id.toString(),
        name: user.fullName,
        image: user.profilePic || "",
      },
    ]);

    res.status(200).json({ success: true, userId: user._id.toString() });
  } catch (error) {
    console.error("Error syncing Stream user:", error.message);
    res.status(500).json({ message: "Unable to sync Stream user" });
  }
}