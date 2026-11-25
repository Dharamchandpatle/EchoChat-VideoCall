import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import aiRoutes from "./routes/ai.route.js";
import authRoutes from "./routes/auth.route.js";
import chatRoutes from "./routes/chat.route.js";
import learningRoutes from "./routes/learning.route.js";
import adminLearningRoutes from "./routes/adminLearning.route.js";
import userRoutes from "./routes/user.route.js";

import { connectDB } from "./lib/db.js";
import Language from "./models/Language.js";
import { seedLearningDatabase } from "./services/learningSeeder.service.js";
import { notFound, errorHandler } from "./middleware/errors.middleware.js";
import { originCheck } from "./middleware/origin.middleware.js";
import helmet from "helmet";

const app = express();
const PORT = process.env.PORT || 5001;
const isProduction = process.env.NODE_ENV === "production";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Allowed browser origins: CLIENT_URL (comma-separated) plus the local Vite dev server.
const allowedOrigins = new Set(
  [process.env.CLIENT_URL, "http://localhost:5173"]
    .filter(Boolean)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
);

app.disable("x-powered-by");

// Security headers. CSP is disabled here because a generic policy would block Stream Chat and
// Stream Video connections; configure a tuned CSP for production (see DEPLOYMENT_GUIDE.md).
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } }));

app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin and server-to-server requests carry no Origin header.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use("/api", originCheck(allowedOrigins));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/learning", learningRoutes);
app.use("/api/admin/learning", adminLearningRoutes);

app.use("/api", notFound);

if (isProduction) {
  const distDir = path.join(__dirname, "../../frontend/dist");
  app.use(express.static(distDir));
  app.get("*", (req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.use(errorHandler);

export const createServer = () => app;

const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error("Server startup aborted: could not connect to MongoDB:", error.message);
    process.exitCode = 1;
    return;
  }

  try {
    const langCount = await Language.countDocuments();
    if (langCount === 0) {
      console.log("No languages found. Seeding Indian language learning data...");
      await seedLearningDatabase();
    }
  } catch (seedErr) {
    console.warn("Could not check or run initial seed:", seedErr.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use, probably by another EchoChat backend that is still running. ` +
          `Stop it, or find it with: Get-NetTCPConnection -LocalPort ${PORT} -State Listen`
      );
    } else {
      console.error("Server failed to start:", error.message);
    }
    process.exit(1);
  });
};

// Only auto-start when executed directly (keeps the app importable for tests).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) startServer();

export default app;
