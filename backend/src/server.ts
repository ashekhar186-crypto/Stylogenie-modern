// backend/src/server.ts
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import path from "path";

import authRoutes from "./routes/auth";
import itemsRoutes from "./routes/items";
import predictRoutes from "./routes/predict";
import describeRoutes from "./routes/describe";
import chatRoutes from "./routes/chat";
import tripRoutes from "./routes/trip";
import recommendRoutes from "./routes/recommend";
import adminRoutes from "./routes/admin";
import feedbackRoutes from "./routes/feedback";
import calendarRoutes from "./routes/calendar";
import statsRoutes from "./routes/stats";
import { rateLimit } from "./middleware/rateLimit";
import { autoApproveWardrobe } from "./middleware/autoApprove";

const app = express();

app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(morgan("dev"));

// Serve uploaded files (dev only)
// Must set Cross-Origin-Resource-Policy: cross-origin because helmet() defaults to
// "same-origin" which prevents the browser on localhost:3000 from loading images
// from localhost:4000. This header only affects THIS route (not API responses).
app.use(
  "/uploads",
  (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(process.cwd(), "uploads"), {
    fallthrough: true,
    maxAge: "1h",
  })
);

app.get("/api/v1/health", (_req, res) => res.json({ ok: true, version: "2.0" }));

// ── Rate limiting ──────────────────────────────────────────
// Auth: 10 login attempts per 15 min, 5 registrations per hour
app.use("/api/v1/auth/login",    rateLimit(10, 15 * 60 * 1000));
app.use("/api/v1/auth/register", rateLimit(5,  60 * 60 * 1000));
// AI endpoints: 30 req per minute per user (generous for normal use)
app.use("/api/v1/describe",      rateLimit(30, 60 * 1000));
app.use("/api/v1/chat",          rateLimit(30, 60 * 1000));
app.use("/api/v1/trip",          rateLimit(20, 60 * 1000));
app.use("/api/v1/recommend",    rateLimit(60, 60 * 1000));

// Auto-approve middleware — runs before all AI features so they always see the full wardrobe
// Applied to the routes that use wardrobe data for AI-powered suggestions
app.use("/api/v1/recommend",  autoApproveWardrobe);
app.use("/api/v1/chat",       autoApproveWardrobe);
app.use("/api/v1/trip",       autoApproveWardrobe);
app.use("/api/v1/stats",      autoApproveWardrobe);

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/items", itemsRoutes);
app.use("/api/v1/predict", predictRoutes);       // legacy predict (URL + upload)
app.use("/api/v1/describe", describeRoutes);     // deep classification
app.use("/api/v1/chat", chatRoutes);             // fashion trend chat
app.use("/api/v1/trip", tripRoutes);             // AI trip planner
app.use("/api/v1/recommend", recommendRoutes);   // outfit recommendation engine
app.use("/api/v1/admin", adminRoutes);           // admin panel
app.use("/api/v1/feedback", feedbackRoutes);     // outfit like/dislike/save
app.use("/api/v1/calendar", calendarRoutes);     // outfit calendar
app.use("/api/v1/stats", statsRoutes);           // wardrobe statistics dashboard

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`🧞 StyloGenie API v2.0 → http://localhost:${port}`);
  if (!process.env.FRONTEND_URL) console.log("  Tip: set FRONTEND_URL in .env");
  if (!process.env.OPENROUTER_API_KEY) console.log("  ⚠ OPENROUTER_API_KEY missing — AI features disabled");
});
