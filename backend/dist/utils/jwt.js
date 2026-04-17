"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cookieOpts = exports.verifyRefresh = exports.signRefresh = exports.signAccess = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";
const signAccess = (p) => jsonwebtoken_1.default.sign(p, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });
exports.signAccess = signAccess;
const signRefresh = (p) => jsonwebtoken_1.default.sign(p, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
exports.signRefresh = signRefresh;
const verifyRefresh = (t) => jsonwebtoken_1.default.verify(t, process.env.JWT_REFRESH_SECRET);
exports.verifyRefresh = verifyRefresh;
exports.cookieOpts = {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // set true behind HTTPS in prod
    path: "/",
};
