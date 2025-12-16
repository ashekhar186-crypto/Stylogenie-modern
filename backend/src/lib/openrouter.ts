import axios from "axios";

export const orClient = axios.create({
  baseURL: process.env.OPENROUTER_BASE || "https://openrouter.ai/api",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_APP_NAME || "StyloGenie",
  },
  timeout: 30000,
});


orClient.interceptors.request.use((config) => {
  config.headers = {
    ...(config.headers as any || {}),
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "",
    "X-Title": process.env.OPENROUTER_APP_NAME || "StyloGenie",
  } as any;

  return config;
});
