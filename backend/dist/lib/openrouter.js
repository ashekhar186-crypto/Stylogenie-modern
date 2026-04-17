"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orClient = void 0;
const axios_1 = __importDefault(require("axios"));
exports.orClient = axios_1.default.create({
    baseURL: process.env.OPENROUTER_BASE || "https://openrouter.ai/api",
    headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME || "StyloGenie",
    },
    timeout: 30000,
});
exports.orClient.interceptors.request.use((config) => {
    config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "",
        "X-Title": process.env.OPENROUTER_APP_NAME || "StyloGenie",
    };
    return config;
});
