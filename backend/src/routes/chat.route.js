import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getStreamToken, syncStreamUser } from "../controllers/chat.controller.js";

const router = express.Router();

router.get("/token", protectRoute, getStreamToken);
router.post("/user/:id", protectRoute, syncStreamUser);

export default router;