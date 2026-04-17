"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/server.ts
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const auth_1 = __importDefault(require("./routes/auth"));
const items_1 = __importDefault(require("./routes/items"));
const predict_1 = __importDefault(require("./routes/predict"));
const describe_1 = __importDefault(require("./routes/describe"));
const chat_1 = __importDefault(require("./routes/chat"));
const trip_1 = __importDefault(require("./routes/trip"));
const recommend_1 = __importDefault(require("./routes/recommend"));
const admin_1 = __importDefault(require("./routes/admin"));
const rateLimit_1 = require("./middleware/rateLimit");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
app.use((0, cookie_parser_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
}));
app.use((0, morgan_1.default)("dev"));
// Serve uploaded files (dev only)
// Must set Cross-Origin-Resource-Policy: cross-origin because helmet() defaults to
// "same-origin" which prevents the browser on localhost:3000 from loading images
// from localhost:4000. This header only affects THIS route (not API responses).
app.use("/uploads", (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
}, express_1.default.static(path_1.default.join(process.cwd(), "uploads"), {
    fallthrough: true,
    maxAge: "1h",
}));
app.get("/api/v1/health", (_req, res) => res.json({ ok: true, version: "2.0" }));
// ── Rate limiting ──────────────────────────────────────────
// Auth: 10 login attempts per 15 min, 5 registrations per hour
app.use("/api/v1/auth/login", (0, rateLimit_1.rateLimit)(10, 15 * 60 * 1000));
app.use("/api/v1/auth/register", (0, rateLimit_1.rateLimit)(5, 60 * 60 * 1000));
// AI endpoints: 30 req per minute per user (generous for normal use)
app.use("/api/v1/describe", (0, rateLimit_1.rateLimit)(30, 60 * 1000));
app.use("/api/v1/chat", (0, rateLimit_1.rateLimit)(30, 60 * 1000));
app.use("/api/v1/trip", (0, rateLimit_1.rateLimit)(20, 60 * 1000));
app.use("/api/v1/recommend", (0, rateLimit_1.rateLimit)(60, 60 * 1000));
// Routes
app.use("/api/v1/auth", auth_1.default);
app.use("/api/v1/items", items_1.default);
app.use("/api/v1/predict", predict_1.default); // legacy predict (URL + upload)
app.use("/api/v1/describe", describe_1.default); // deep classification
app.use("/api/v1/chat", chat_1.default); // fashion trend chat
app.use("/api/v1/trip", trip_1.default); // AI trip planner
app.use("/api/v1/recommend", recommend_1.default); // outfit recommendation engine
app.use("/api/v1/admin", admin_1.default); // admin panel
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
    console.log(`🧞 StyloGenie API v2.0 → http://localhost:${port}`);
    if (!process.env.FRONTEND_URL)
        console.log("  Tip: set FRONTEND_URL in .env");
    if (!process.env.OPENROUTER_API_KEY)
        console.log("  ⚠ OPENROUTER_API_KEY missing — AI features disabled");
});
