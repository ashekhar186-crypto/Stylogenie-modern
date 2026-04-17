"use strict";
// backend/src/lib/localClassifier.ts
// HTTP client for the local Python CLIP fashion classifier service.
//
// The classifier runs as a separate process:
//   python backend/classifier_service.py
//   (port 5001 by default, configurable via CLASSIFIER_PORT in .env)
//
// Why a dedicated classifier instead of Ollama vision?
//   - CLIP is purpose-built for category/attribute classification (faster, more accurate)
//   - ~3-6 seconds on Intel CPU vs 120+ seconds for LLM vision models
//   - 400 MB model vs 1.7-4.7 GB for LLaVA/moondream
//   - Returns structured JSON directly — no prompt parsing needed
//   - Works 100% offline after first model download
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.localClassify = exports.isClassifierRunning = void 0;
const axios_1 = __importDefault(require("axios"));
const CLASSIFIER_BASE = `http://127.0.0.1:${process.env.CLASSIFIER_PORT?.trim() || "5001"}`;
// In-process availability cache — check once every 30 seconds
let serviceAvailable = null;
let lastCheck = 0;
const CHECK_INTERVAL_MS = 30_000;
async function isClassifierRunning() {
    const now = Date.now();
    if (serviceAvailable !== null && now - lastCheck < CHECK_INTERVAL_MS) {
        return serviceAvailable;
    }
    try {
        await axios_1.default.get(`${CLASSIFIER_BASE}/health`, { timeout: 2_000 });
        serviceAvailable = true;
    }
    catch {
        serviceAvailable = false;
    }
    lastCheck = now;
    return serviceAvailable;
}
exports.isClassifierRunning = isClassifierRunning;
/**
 * Classify a fashion image using the local CLIP service.
 *
 * imageSource: "https://..." URL  OR  "data:image/...;base64,..." data URL
 * Returns { classification, usedModel } or null if the service isn't running.
 */
async function localClassify(imageSource) {
    if (!(await isClassifierRunning()))
        return null;
    try {
        console.log("[localClassifier] Calling CLIP fashion classifier…");
        const { data } = await axios_1.default.post(`${CLASSIFIER_BASE}/classify`, { imageSource }, { timeout: 60_000 } // 60s — enough for slow CPU, usually takes 3-8s
        );
        const classification = data?.classification;
        if (!classification?.title) {
            console.warn("[localClassifier] Empty classification returned");
            return null;
        }
        const usedModel = data?.model ?? "fashion-clip";
        console.log(`[localClassifier] ✅ Classified in ~0s (${usedModel})`);
        return { classification, usedModel };
    }
    catch (e) {
        const msg = e?.response?.data?.detail ?? e?.message ?? "Classifier error";
        if (!msg.includes("ECONNREFUSED")) {
            console.warn("[localClassifier] Error:", msg.slice(0, 120));
        }
        // Mark unavailable briefly on errors so we don't keep hammering a broken service
        serviceAvailable = false;
        lastCheck = Date.now();
        return null;
    }
}
exports.localClassify = localClassify;
