// Operator-only admin provisioning. Run from the server environment, never from the browser:
//   npm run admin:grant -- someone@example.com
//   npm run admin:grant -- someone@example.com --revoke
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import User from "../models/User.js";

const [, , rawEmail, flag] = process.argv;
const revoke = flag === "--revoke";

if (!rawEmail || !rawEmail.includes("@")) {
  console.error("Usage: npm run admin:grant -- <email> [--revoke]");
  process.exit(1);
}

try {
  await connectDB();
  const email = rawEmail.trim().toLowerCase();
  const user = await User.findOneAndUpdate(
    { email },
    { role: revoke ? "user" : "admin" },
    { new: true }
  ).select("email role");

  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exitCode = 1;
  } else {
    console.log(`${user.email} is now role "${user.role}"`);
  }
} catch (error) {
  console.error("Admin provisioning failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
