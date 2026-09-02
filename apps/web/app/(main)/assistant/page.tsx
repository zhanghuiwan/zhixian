"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Menu,
  MessageSquarePlus,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "@/components/icons";
import { ApiError, api, streamApi, type SSEMessage } from "@/lib/api";
import type { AIConversation, AIMessage, AIToolRun } from "@/lib/types";

type DisplayMessage = {
  key: string;
  role: "user" | "assistant";
  content: string;
};

type ToolCard = {
  key: string;
  event: string;
  toolRunId?: number;
  toolName?: string;
  summary: string;
  data?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
  status?: string;
};

const pageRoutes: Record<string, string> = {
  home: "/dashboard",
  learn: "/learn",
  articles: "/articles",
  vocabulary: "/vocabulary",
  profile: "/profile",
};

export default function AssistantPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [cards, setCards] = useState<ToolCard[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const initialPromptHandled = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async () => {
    setConversations(await api<AIConversation[]>("/ai/conversations"));
  }, []);

  const openConversation = useCallback(async (id: number) => {
    const [history, toolRuns] = await Promise.all([
      api<AIMessage[]>(`/ai/conversations/${id}/messages`),
      api<AIToolRun[]>(`/ai/conversations/${id}/tool-runs`),
    ]);
    setActiveId(id);
    setMessages(history.filter((item) => item.role !== "tool" && item.content).map((item) => ({
      key: `message-${item.id}`,
      role: item.role as "user" | "assistant",
      content: item.content,
    })));
    setCards(toolRuns.map((item) => ({
      key: `tool-${item.id}`,
      event: item.status === "pending_confirmation"
        ? "confirmation.required"
        : item.status === "succeeded"
          ? "tool.completed"
          : item.status === "cancelled"
            ? "tool.cancelled"
            : "tool.failed",
      toolRunId: item.id,
      toolName: item.tool_name,
      summary: item.result_summary || "工具执行中",
      data: item.result || {},
      arguments: item.arguments,
      status: item.status,
    })));
    setDrawerOpen(false);
  }, []);

  useEffect(() => { loadConversations().catch(() => undefined); }, [loadConversations]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, cards]);

  const handleStreamEvent = useCallback((message: SSEMessage) => {
    const data = message.data;
    if (message.event === "conversation.created") {
      setActiveId(Number(data.conversation_id));
    } else if (message.event === "message.delta") {
      const delta = String(data.content || "");
      setMessages((current) => {
        const last = current.at(-1);
        if (last?.role === "assistant" && last.key === "streaming") {
          return [...current.slice(0, -1), { ...last, content: last.content + delta }];
        }
        return [...current, { key: "streaming", role: "assistant", content: delta }];
      });
    } else if (["tool.started", "tool.completed", "tool.failed", "confirmation.required"].includes(message.event)) {
      const toolRunId = Number(data.tool_run_id);
      setCards((current) => {
        const next: ToolCard = {
          key: `tool-${toolRunId || Date.now()}`,
          event: message.event,
          toolRunId,
          toolName: String(data.tool_name || ""),
          summary: String(data.summary || data.message || "正在处理"),
          data: (data.data || {}) as Record<string, unknown>,
          arguments: (data.arguments || {}) as Record<string, unknown>,
        };
        return [...current.filter((item) => item.toolRunId !== toolRunId), next];
      });
    } else if (message.event === "navigation.requested") {
      const payload = (data.data || {}) as Record<string, unknown>;
      const page = String(payload.page || "");
      const destination = page === "article" && payload.article_id
        ? `/articles/${payload.article_id}`
        : pageRoutes[page];
      if (destination) router.push(destination);
    } else if (message.event === "message.completed") {
      setMessages((current) => current.map((item) => item.key === "streaming" ? { ...item, key: `message-${String(data.message_id)}` } : item));
    } else if (message.event === "error") {
      setError(String(data.message || "本次请求未能完成"));
    }
  }, [router]);

  const send = useCallback(async (text: string) => {
    const cleaned = text.trim();
    if (!cleaned || streaming) return;
    setError("");
    setInput("");
    setMessages((current) => [...current, { key: `user-${Date.now()}`, role: "user", content: cleaned }]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamApi("/ai/chat/stream", {
        message: cleaned,
        conversation_id: activeId,
      }, handleStreamEvent, controller.signal);
      await loadConversations();
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") {
        setError(cause instanceof ApiError ? cause.message : "连接中断，请重试");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [activeId, handleStreamEvent, loadConversations, streaming]);

  useEffect(() => {
    if (initialPromptHandled.current) return;
    const prompt = new URL(window.location.href).searchParams.get("message");
    if (prompt) {
      initialPromptHandled.current = true;
      void send(prompt);
    }
  }, [send]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await send(input);
  }

  async function confirm(card: ToolCard, confirmed: boolean) {
    if (!card.toolRunId) return;
    const result = await api<{ status: string; result_summary: string; result: Record<string, unknown> | null }>(`/ai/tool-runs/${card.toolRunId}/confirm`, {
      method: "POST",
      body: JSON.stringify({ confirmed }),
    });
    setCards((current) => current.map((item) => item.key === card.key ? {
      ...item,
      event: result.status === "succeeded" ? "tool.completed" : "tool.cancelled",
      summary: result.result_summary,
      data: result.result || {},
      status: result.status,
    } : item));
    await loadConversations();
  }

  async function removeConversation(id: number) {
    await api(`/ai/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
      setCards([]);
    }
    await loadConversations();
  }

  function freshConversation() {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setCards([]);
    setError("");
    setDrawerOpen(false);
  }

  return (
    <div className="assistant-page">
      <aside className={`assistant-history ${drawerOpen ? "open" : ""}`}>
        <div className="assistant-history-head">
          <strong>对话记录</strong>
          <button onClick={freshConversation}><MessageSquarePlus size={18} />新对话</button>
        </div>
        <div className="conversation-list">
          {conversations.map((item) => (
            <div className={item.id === activeId ? "active" : ""} key={item.id}>
              <button onClick={() => void openConversation(item.id)}>
                <span>{item.title}</span>
                <small>{item.provider} · {item.model}</small>
              </button>
              <button className="conversation-delete" onClick={() => void removeConversation(item.id)} aria-label="删除对话"><Trash2 size={14} /></button>
            </div>
          ))}
          {!conversations.length && <p>还没有历史对话</p>}
        </div>
      </aside>
      {drawerOpen && <button className="assistant-scrim" onClick={() => setDrawerOpen(false)} aria-label="关闭对话列表" />}

      <section className="assistant-chat">
        <header className="assistant-topbar">
          <button className="assistant-menu" onClick={() => setDrawerOpen(true)} aria-label="打开对话列表"><Menu size={20} /></button>
          <div><Sparkles size={18} /><span><strong>知闲 AI</strong><small>你的英语学习助手</small></span></div>
          <Link href="/profile">模型设置</Link>
        </header>

        <div className="assistant-messages">
          {!messages.length && !cards.length && (
            <div className="assistant-welcome">
              <span><Sparkles size={27} /></span>
              <h1>今天想从哪里开始？</h1>
              <p>我能读取你的真实学习记录、安排复习、查词、生成内容，也能替你管理生词本。</p>
              <div>
                {["昨天学习了哪些词？", "获取明天的复习计划", "把 wander 加入生词本", "打开学习页面"].map((item) => <button key={item} onClick={() => void send(item)}>{item}</button>)}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <article className={`chat-message ${message.role}`} key={message.key}>
              <span>{message.role === "assistant" ? "知" : "我"}</span>
              <div>{message.content || (streaming ? <i className="typing-dot">思考中…</i> : null)}</div>
            </article>
          ))}
          {cards.map((card) => (
            <article className={`tool-card ${card.event.replace(".", "-")}`} key={card.key}>
              <div className="tool-card-icon">{card.event === "confirmation.required" ? <Trash2 size={17} /> : card.event === "tool.failed" ? <X size={17} /> : <Check size={17} />}</div>
              <div><small>{card.toolName || "学习工具"}</small><strong>{card.summary}</strong>
                {card.event === "confirmation.required" && <p>确认后将执行这一次已锁定的操作，模型不能更换目标。</p>}
              </div>
              {card.event === "confirmation.required" && <div className="tool-card-actions"><button onClick={() => void confirm(card, false)}>取消</button><button className="danger" onClick={() => void confirm(card, true)}>确认删除</button></div>}
            </article>
          ))}
          {error && <div className="assistant-error"><span>{error}</span>{error.includes("配置") && <Link href="/profile">前往设置</Link>}</div>}
          <div ref={endRef} />
        </div>

        <form className="assistant-composer" onSubmit={submit}>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); }
          }} placeholder="问学习记录、查词，或让我帮你操作…" rows={2} disabled={streaming} />
          {streaming ? <button type="button" onClick={() => abortRef.current?.abort()} aria-label="停止生成"><Square size={16} /></button> : <button type="submit" disabled={!input.trim()} aria-label="发送"><Send size={18} /></button>}
          <small>AI 可能出错；学习记录与数据操作均由知闲工具核验。</small>
        </form>
      </section>
    </div>
  );
}
