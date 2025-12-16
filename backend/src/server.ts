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

// 👇 serve uploaded files (dev)
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    fallthrough: true,
    maxAge: "1h",
  })
);

app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/items", itemsRoutes);
app.use("/api/v1/predict", predictRoutes);

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  if (!process.env.FRONTEND_URL) {
    console.log("Tip: set FRONTEND_URL in .env (e.g. http://localhost:3000)");
  }
  if (!process.env.BACKEND_URL) {
    console.log("Tip: set BACKEND_URL in .env (e.g. http://localhost:4000)");
  }
  if (!process.env.OPENAI_API_KEY) {
    console.log("Tip: set OPENAI_API_KEY in backend/.env for /api/v1/predict");
  }
});
