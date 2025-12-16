"use client";

import * as React from "react";
import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! Ask me anything about outfits or styling :)" },
  ]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = prompt.trim();
    if (!text) return;

    setPrompt("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);

    try {
      const r = await api.post("/api/v1/predict/chat", { prompt: text });
      const reply = (r.data?.text as string) ?? "…";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err: unknown) {
      const msg = isAxiosError(err)
        ? err.response?.data?.error ?? err.message
        : (err instanceof Error ? err.message : "Chat failed");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="max-h-[60vh] overflow-auto">
        <CardContent className="pt-6 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-md px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-primary/5 border border-primary/20"
                  : "bg-muted"
              }`}
            >
              <div className="mb-1 text-xs opacity-70 uppercase">
                {m.role === "user" ? "You" : "StyloGenie"}
              </div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          <div ref={endRef} />
        </CardContent>
      </Card>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <Textarea
          placeholder="Ask for outfit ideas, color matching, occasions… (Cmd/Ctrl+Enter to send)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
        />
        <Button onClick={send} disabled={loading || !prompt.trim()}>
          {loading ? "Thinking…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
