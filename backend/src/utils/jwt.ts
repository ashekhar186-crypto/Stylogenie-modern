import jwt from "jsonwebtoken";

type Role = "ADMIN" | "MEMBER";
export type JwtPayload = { sub: string; role: Role };

const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

export const signAccess = (p: JwtPayload) =>
  jwt.sign(p, process.env.JWT_ACCESS_SECRET!, { expiresIn: ACCESS_TTL });

export const signRefresh = (p: JwtPayload) =>
  jwt.sign(p, process.env.JWT_REFRESH_SECRET!, { expiresIn: REFRESH_TTL });

export const verifyRefresh = (t: string) =>
  jwt.verify(t, process.env.JWT_REFRESH_SECRET!) as JwtPayload & jwt.JwtPayload;

export const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false, // set true behind HTTPS in prod
  path: "/",
};
