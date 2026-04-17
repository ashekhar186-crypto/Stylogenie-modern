"use strict";
// backend/src/lib/modelHealth.ts
// Shared model health tracker — skips bad vision models automatically
//
// Failure kinds:
//  • permanent  (400 / "not a valid model" / "does not exist")
//               → blacklisted for the whole process lifetime, never retried
//               These are configuration errors — retrying won't help.
//
//  • transient  (404 "no endpoints found" / 429 rate-limit / 503 unavailable)
//               → 30-minute cooldown then auto-cleared and retried
//               "No endpoints found" means the model is temporarily at capacity,
//               NOT that the model ID is wrong.
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateModelList = exports.getHealthSnapshot = exports.markModelHealthy = exports.markModelFailed = exports.isModelHealthy = void 0;
const TRANSIENT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const healthMap = new Map();
/** Returns true if the model should be tried, false if it should be skipped. */
function isModelHealthy(model) {
    const entry = healthMap.get(model);
    if (!entry)
        return true;
    if (entry.kind === "permanent") {
        return false; // never recover within this process
    }
    // transient: recover after cooldown
    if (Date.now() - entry.failedAt > TRANSIENT_COOLDOWN_MS) {
        healthMap.delete(model);
        return true;
    }
    return false;
}
exports.isModelHealthy = isModelHealthy;
/**
 * Mark a model as failed.
 * Pass status + message — the tracker determines permanent vs transient.
 */
function markModelFailed(model, status, msg) {
    // PERMANENT: wrong model ID — retrying will never help
    // TRANSIENT: capacity issues — model may come back online
    const isPermanent = status === 400 ||
        msg.includes("not a valid model") ||
        msg.includes("does not exist") ||
        msg.includes("is not a valid model");
    // Note: 404 "no endpoints found" = temporarily no capacity → TRANSIENT, not permanent
    const existing = healthMap.get(model);
    // Don't downgrade a permanent failure to transient
    if (existing?.kind === "permanent")
        return;
    healthMap.set(model, {
        kind: isPermanent ? "permanent" : "transient",
        failedAt: Date.now(),
        reason: msg.slice(0, 120),
    });
    console.warn(`[modelHealth] ${model} marked ${isPermanent ? "PERMANENTLY FAILED" : "cooling down (5 min)"}: ${msg.slice(0, 80)}`);
}
exports.markModelFailed = markModelFailed;
/** Mark a model as healthy again (e.g., after a successful call). */
function markModelHealthy(model) {
    if (healthMap.has(model)) {
        healthMap.delete(model);
    }
}
exports.markModelHealthy = markModelHealthy;
/** Returns a snapshot of current health state for debugging / status endpoint. */
function getHealthSnapshot() {
    const now = Date.now();
    const snap = {};
    healthMap.forEach((entry, model) => {
        snap[model] = {
            kind: entry.kind,
            reason: entry.reason,
            ...(entry.kind === "transient"
                ? { cooldownRemaining: `${Math.max(0, Math.round((TRANSIENT_COOLDOWN_MS - (now - entry.failedAt)) / 1000))}s` }
                : {}),
        };
    });
    return snap;
}
exports.getHealthSnapshot = getHealthSnapshot;
/** Validate model ID format at startup — logs a warning for suspicious IDs. */
function validateModelList(models, label) {
    models.forEach((m) => {
        if (!m.includes("/")) {
            console.warn(`[modelHealth] WARNING: "${m}" in ${label} doesn't look like a valid OpenRouter model ID (expected "provider/model-name[:tag]"). It will be auto-skipped on first 400 error.`);
        }
    });
    console.log(`[modelHealth] ${label} has ${models.length} model(s): ${models.join(", ")}`);
}
exports.validateModelList = validateModelList;
