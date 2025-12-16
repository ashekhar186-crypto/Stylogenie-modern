const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
import axios from "axios";
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // send/receive httpOnly cookies
});
