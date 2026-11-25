import jwt from "jsonwebtoken";
import User from "../models/User.js";

const unauthorized = (res, message) => res.status(401).json({ message });

export const protectRoute = async (req, res, next) => {
  const token = req.cookies?.jwt;

  if (!token) {
    return unauthorized(res, "Unauthorized - No token provided");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET_KEY, { algorithms: ["HS256"] });
  } catch (error) {
    // Expired or tampered tokens are an authentication failure, not a server outage.
    const reason = error.name === "TokenExpiredError" ? "Session expired" : "Invalid token";
    return unauthorized(res, `Unauthorized - ${reason}`);
  }

  try {
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return unauthorized(res, "Unauthorized - User not found");
    }
    if (user.accountStatus === "suspended") {
      return res.status(403).json({ message: "Your account has been suspended. Contact support." });
    }

    // Throttled activity marker (at most one write per 5 minutes per user). Not awaited.
    const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
    if (Date.now() - lastSeen > 5 * 60 * 1000) {
      User.updateOne({ _id: user._id }, { lastSeenAt: new Date() }).catch(() => {});
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("Error in protectRoute middleware:", error.message);
    return res.status(503).json({ message: "Database unavailable. Please try again shortly." });
  }
};

export const adminOnly = (req, res, next) => {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const isAdmin =
    req.user &&
    (req.user.role === "admin" || (adminEmail && req.user.email?.toLowerCase() === adminEmail));

  if (isAdmin) return next();
  return res.status(403).json({ message: "Forbidden: Admin access required" });
};
