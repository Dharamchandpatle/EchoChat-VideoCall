import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  getFriendRequests,
  getMyFriends,
  getOutgoingFriendReqs,
  getRecommendedUsers,
  rejectFriendRequest,
  sendFriendRequest,
} from "../controllers/user.controller.js";
import {
  blockUser,
  getBlockedUsers,
  removeFriend,
  reportUser,
  unblockUser,
} from "../controllers/moderation.controller.js";

const router = express.Router();

// All social routes require a logged-in user.
router.use(protectRoute);

router.get("/", getRecommendedUsers);
router.get("/friends", getMyFriends);

router.post("/friend-request/:id", sendFriendRequest);
router.put("/friend-request/:id/accept", acceptFriendRequest);
router.put("/friend-request/:id/reject", rejectFriendRequest);
router.delete("/friend-request/:id", cancelFriendRequest);

router.delete("/friends/:id", removeFriend);

router.post("/:id/block", blockUser);
router.delete("/:id/block", unblockUser);
router.get("/blocked", getBlockedUsers);
router.post("/:id/report", reportUser);

router.get("/friend-requests", getFriendRequests);
router.get("/outgoing-friend-requests", getOutgoingFriendReqs);

export default router;
