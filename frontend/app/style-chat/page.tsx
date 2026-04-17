"use client";

import * as React from "react";
import { useState, useRef, useEffect, useId } from "react";
import { toast } from "sonner";
import axios from "axios";
import { api } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

function extractErr(e: unknown): string {
  if (axios.isAxiosError(e)) return e.response?.data?.error ?? e.message;
  if (e instanceof Error) return e.message;
  return "Unknown error";
}

const SUGGESTED_PROMPTS = [
  "What are the biggest fashion trends for 2025?",
  "Build me a 10-piece capsule wardrobe for work",
  "Suggest a complete office-to-evening outfit transition",
  "What colours work best together this season?",
  "Give me 3 outfit ideas from what I own",
  "What should I wear to an Indian festive occasion?",
  "How do I style oversized clothes without looking sloppy?",
  "What are the top sustainable fashion brands right now?",
];

// ─── Lightweight markdown renderer ────────────────────────────────────────────
// Handles: **bold**, *italic*, `code`, • / - bullets, numbered lists, blank lines.
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line → spacer
    if (!line.trim()) {
      nodes.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // Numbered list item: "1. " or "2. "
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-1 text-sm">
          {listItems.map((item, j) => (
            <li key={j} className="leading-relaxed">{inlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Bullet list item: "- " or "• " or "* "
    if (/^[-•*]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-•*]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^[-•*]\s/, ""));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="space-y-1 my-1 text-sm">
          {listItems.map((item, j) => (
            <li key={j} className="flex items-start gap-2 leading-relaxed">
              <span className="text-purple-400 mt-1 flex-shrink-0 text-xs">✦</span>
              <span>{inlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Normal paragraph
    nodes.push(
      <p key={i} className="text-sm leading-relaxed">{inlineMarkdown(line)}</p>
    );
    i++;
  }
  return nodes;
}

function inlineMarkdown(text: string): React.ReactNode {
  // Process **bold**, *italic*, `code` inline
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2] !== undefined) {
      parts.push(<strong key={key++} className="font-bold text-white">{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      parts.push(<em key={key++} className="italic text-white/80">{match[3]}</em>);
    } else if (match[4] !== undefined) {
      parts.push(<code key={key++} className="bg-white/10 px-1.5 py-0.5 rounded text-purple-300 text-xs font-mono">{match[4]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ─── Message Bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, onRetry }: { msg: ChatMessage & { error?: boolean }; onRetry?: () => void }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold
        ${isUser
          ? "bg-purple-600 text-white"
          : "bg-gradient-to-br from-violet-600 to-purple-800 text-white shadow-lg shadow-purple-900/40"
        }`}>
        {isUser ? "U" : "🧞"}
      </div>

      {/* Bubble */}
      <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${
        isUser
          ? "bg-purple-600 text-white rounded-tr-sm"
          : msg.error
            ? "bg-rose-900/30 text-rose-200 rounded-tl-sm border border-rose-700/30"
            : "bg-slate-800/90 text-white/90 rounded-tl-sm border border-white/8 shadow-lg"
      }`}>
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <div className="space-y-1 text-white/85">
            {renderMarkdown(msg.content)}
          </div>
        )}
        {msg.error && onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-xs text-rose-300 hover:text-white underline transition-colors"
          >
            ↩ Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StyleChatPage() {
  const [messages, setMessages] = useState<(ChatMessage & { id: string; error?: boolean })[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! I'm **GENIE** ✨ — your personal AI fashion stylist.\n\nI know your wardrobe inside out (when the toggle is on) and can help with:\n- Outfit ideas from what you own\n- 2025 trend forecasts & styling tips\n- What to wear for any occasion\n- Capsule wardrobe building\n- Ethnic and western fashion advice\n\nWhat's on your style radar today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useWardrobe, setUseWardrobe] = useState(true);
  const [lastUserMsg, setLastUserMsg] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgCounter = useRef(0);

  function nextId() {
    return `msg-${Date.now()}-${++msgCounter.current}`;
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setLastUserMsg(content);
    const userMsg: ChatMessage & { id: string; error?: boolean } = { id: nextId(), role: "user" as const, content };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const r = await api.post("/api/v1/chat", {
        // Send only non-error messages to API
        messages: nextMessages
          .filter((m) => !m.error)
          .map(({ role, content }) => ({ role, content })),
        wardrobeContext: useWardrobe,
      });
      const reply = r.data.message;
      setMessages((prev) => [...prev, { id: nextId(), ...reply }]);
    } catch (e) {
      const errMsg = extractErr(e);
      toast.error(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant" as const,
          content: `Something went wrong: ${errMsg}. Please try again.`,
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function retryLast() {
    // Remove the error message and retry the last user message
    setMessages((prev) => prev.filter((m) => !m.error));
    sendMessage(lastUserMsg);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const clearChat = () => {
    setMessages([{
      id: "welcome-fresh",
      role: "assistant",
      content: "Fresh start! ✨ What fashion question can I help you with today?",
    }]);
  };

  const showSuggestions = messages.length === 1 && !loading;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-5rem)] max-h-[900px]">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl w-8 h-8 flex items-center justify-center text-base shadow-lg shadow-purple-900/40">🧞</span>
            <span>Style Chat</span>
          </h1>
          <p className="text-white/40 text-sm mt-0.5 ml-10">AI fashion consultant · trend-aware · wardrobe-smart</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Wardrobe toggle */}
          <label
            className="flex items-center gap-2 cursor-pointer select-none group"
            title={useWardrobe ? "GENIE knows your wardrobe — click to disable" : "General fashion mode — click to enable wardrobe"}
          >
            <div
              onClick={() => setUseWardrobe(!useWardrobe)}
              className={`w-10 h-5 rounded-full transition-all relative ${useWardrobe ? "bg-purple-600 shadow-md shadow-purple-900/50" : "bg-white/10"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${useWardrobe ? "left-5" : "left-0.5"}`} />
            </div>
            <span className={`text-xs font-medium transition-colors ${useWardrobe ? "text-purple-300" : "text-white/30"}`}>
              {useWardrobe ? "✦ My wardrobe" : "General"}
            </span>
          </label>
          <button onClick={clearChat} className="text-white/25 hover:text-white/60 text-xs transition-colors px-2 py-1 rounded-lg hover:bg-white/5">
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 scroll-smooth pr-1">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onRetry={msg.error ? retryLast : undefined}
          />
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center flex-shrink-0 text-sm shadow-lg shadow-purple-900/40">🧞</div>
            <div className="bg-slate-800/90 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5 shadow-lg">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" />
              <span className="text-white/30 text-xs ml-1">styling…</span>
            </div>
          </div>
        )}

        {/* Suggested prompts — only on first load */}
        {showSuggestions && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="text-left px-4 py-3 rounded-xl bg-white/4 hover:bg-purple-600/20 border border-white/8 hover:border-purple-500/40 text-white/55 hover:text-white text-xs transition-all duration-200 leading-relaxed"
              >
                <span className="text-purple-400/60 mr-1.5">✦</span>{p}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 pt-3 border-t border-white/8">
        {/* Wardrobe mode indicator */}
        {useWardrobe && (
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-purple-400/60 text-[10px]">GENIE is reading your wardrobe</span>
          </div>
        )}
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={useWardrobe ? "Ask about your outfits, trends, styling tips…" : "Ask about fashion, trends, styling tips…"}
            rows={1}
            disabled={loading}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500/60 focus:bg-white/8 transition-all resize-none disabled:opacity-50"
            style={{ maxHeight: "120px", overflowY: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 shadow-lg shadow-purple-900/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-white/15 text-[10px] mt-2 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
