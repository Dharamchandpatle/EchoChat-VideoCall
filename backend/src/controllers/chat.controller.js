import { generateStreamToken, upsertStreamUsers } from "../lib/stream.js";
import User from "../models/User.js";

export async function getStreamToken(req, res) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Authenticated user is required" });
    }

    const userId = req.user._id.toString();
    const token = generateStreamToken(userId);

    console.log("Stream token generated for user:", userId);

    res.status(200).json({ token });
  } catch (error) {
    console.log("Error in getStreamToken controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function syncStreamUser(req, res) {
  try {
    const user = await User.findById(req.params.id).select("_id fullName profilePic");

    if (!user) return res.status(404).json({ message: "User not found" });

    await upsertStreamUsers([
      {
        id: user._id.toString(),
        name: user.fullName,
        image: user.profilePic || undefined,
      },
    ]);

    res.status(200).json({ success: true, userId: user._id.toString() });
  } catch (error) {
    console.error("Error syncing Stream user:", error.message);
    res.status(500).json({ message: "Unable to sync Stream user" });
  }
}