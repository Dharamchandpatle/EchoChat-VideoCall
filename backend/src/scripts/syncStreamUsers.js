import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import { connectDB } from "../lib/db.js";
import { upsertStreamUsers } from "../lib/stream.js";

const BATCH_SIZE = 100;

const syncStreamUsers = async () => {
  await connectDB();

  const users = await User.find().select("_id fullName profilePic").lean();
  const streamUsers = users.map((user) => ({
    id: user._id.toString(),
    name: user.fullName,
    image: user.profilePic || undefined,
  }));

  for (let index = 0; index < streamUsers.length; index += BATCH_SIZE) {
    const batch = streamUsers.slice(index, index + BATCH_SIZE);
    await upsertStreamUsers(batch);
    console.log(`Synchronized ${Math.min(index + batch.length, streamUsers.length)} of ${streamUsers.length} users`);
  }

  console.log(`Stream user synchronization complete: ${streamUsers.length} users`);
};

try {
  await syncStreamUsers();
  await mongoose.disconnect();
} catch (error) {
  console.error("Stream user synchronization failed:", error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
}