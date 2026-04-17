"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function requireAuth(req, res, next) {
    const token = req.cookies?.access_token;
    if (!token)
        return res.status(401).json({ error: "Unauthenticated" });
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_ACCESS_SECRET);
        req.auth = { sub: payload.sub, role: payload.role };
        next();
    }
    catch {
        return res.status(401).json({ error: "Invalid/expired token" });
    }
}
exports.requireAuth = requireAuth;
function requireRole(role) {
    return (req, res, next) => {
        if (!req.auth)
            return res.status(401).json({ error: "Unauthenticated" });
        if (req.auth.role !== role)
            return res.status(403).json({ error: "Forbidden" });
        next();
    };
}
exports.requireRole = requireRole;
