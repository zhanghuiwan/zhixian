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
import { MarkdownMessage } from "@/components/markdown-message";
import type { AIConversation, AIMessage, AIResponseAction, AIToolRun, Article } from "@/lib/types";

type DisplayMessage = {
  key: string;
  role: "user" | "assistant";
  content: string;
  actions?: AIResponseAction[];
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
  vocabulary: "/wordbooks",
  profile: "/profile",
};

const transientToolNames = new Set([
  "lookup_word",
  "get_learning_history",
  "get_review_plan",
  "get_difficult_words",
  "list_vocabulary_collections",
  "search_conversation_history",
]);

function isTransientCard(card: ToolCard) {
  return card.toolName ? transientToolNames.has(card.toolName) : false;
}

const actionTypes = new Set([
  "add_word_to_collection",
  "request_custom_word",
  "save_sentence",
  "import_article",
  "navigate",
]);

function parseActions(value: unknown): AIResponseAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AIResponseAction => {
    if (!item || typeof item !== "object") return false;
    const action = item as Record<string, unknown>;
    return typeof action.id === "string"
      && typeof action.type === "string"
      && actionTypes.has(action.type)
      && typeof action.label === "string"
      && !!action.payload
      && typeof action.payload === "object";
  });
}

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error("操作参数无效");
  return value;
}

function payloadNumber(payload: Record<string, unknown>, key: string) {
  const value = Number(payload[key]);
  if (!Number.isInteger(value) || value < 1) throw new Error("操作参数无效");
  return value;
}

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
  const [actionStates, setActionStates] = useState<Record<string, "pending" | "done">>({});
  const abortRef = useRef<AbortController | null>(null);
  const initialPromptHandled = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async () => {
    const data = await api<AIConversation[]>("/ai/conversations");
    setConversations(data);
    return data;
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
      actions: item.actions,
    })));
    setCards(toolRuns.filter((item) => (
      item.status === "pending_confirmation" || !transientToolNames.has(item.tool_name)
    )).map((item) => ({
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

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      await loadConversations();
      const prompt = new URL(window.location.href).searchParams.get("message");
      if (prompt) return;
      const today = await api<AIConversation | null>("/ai/conversations/today");
      if (!cancelled && today) await openConversation(today.id);
    }
    restore().catch(() => undefined);
    return () => { cancelled = true; };
  }, [loadConversations, openConversation]);
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
          status: message.event === "tool.completed" ? "succeeded" : message.event === "tool.failed" ? "failed" : "running",
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
      const actions = parseActions(data.actions);
      setMessages((current) => current.map((item) => item.key === "streaming" ? { ...item, key: `message-${String(data.message_id)}`, actions } : item));
      setCards((current) => current.filter((item) => !isTransientCard(item)));
    } else if (message.event === "error") {
      setError(String(data.message || "本次请求未能完成"));
      setCards((current) => current.filter((item) => !isTransientCard(item)));
    }
  }, [router]);

  const send = useCallback(async (text: string) => {
    const cleaned = text.trim();
    if (!cleaned || streaming) return;
    setError("");
    setInput("");
    setCards((current) => current.filter((item) => !isTransientCard(item)));
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

  async function performAction(messageKey: string, action: AIResponseAction) {
    const stateKey = `${messageKey}:${action.id}`;
    if (actionStates[stateKey] === "pending" || actionStates[stateKey] === "done") return;
    setActionStates((current) => ({ ...current, [stateKey]: "pending" }));
    try {
      if (action.type === "add_word_to_collection") {
        const collectionId = payloadNumber(action.payload, "collection_id");
        const term = payloadString(action.payload, "term");
        await api(`/library/personal/${collectionId}/words`, {
          method: "POST",
          body: JSON.stringify({ terms: [term] }),
        });
      } else if (action.type === "request_custom_word") {
        const term = payloadString(action.payload, "term");
        await send(`请将单词 ${term} 加入我的新增单词，并加入默认生词本。`);
      } else if (action.type === "save_sentence") {
        await api("/sentences", {
          method: "POST",
          body: JSON.stringify({
            text: payloadString(action.payload, "text"),
            translation: payloadString(action.payload, "translation"),
            conversation_id: payloadNumber(action.payload, "conversation_id"),
          }),
        });
      } else if (action.type === "import_article") {
        const article = await api<Article>("/articles/import-text", {
          method: "POST",
          body: JSON.stringify({
            content: payloadString(action.payload, "content"),
            title: payloadString(action.payload, "title"),
          }),
        });
        router.push(`/articles/${article.id}`);
      } else if (action.type === "navigate") {
        const path = payloadString(action.payload, "path");
        if (path === "/learn" || /^\/articles\/\d+$/.test(path)) router.push(path);
        else throw new Error("不支持的页面操作");
      }
      setActionStates((current) => ({ ...current, [stateKey]: "done" }));
    } catch (cause) {
      setActionStates((current) => {
        const next = { ...current };
        delete next[stateKey];
        return next;
      });
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "操作失败，请重试");
    }
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

  async function freshConversation() {
    abortRef.current?.abort();
    try {
      const conversation = await api<AIConversation>("/ai/conversations", {
        method: "POST",
        body: JSON.stringify({ title: "新对话" }),
      });
      setActiveId(conversation.id);
      setMessages([]);
      setCards([]);
      setError("");
      setDrawerOpen(false);
      await loadConversations();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "无法新建对话");
    }
  }

  return (
    <div className="assistant-page">
      <aside className={`assistant-history ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="assistant-history-head">
          <strong>对话记录</strong>
          <button onClick={() => void freshConversation()}><MessageSquarePlus size={18} />新对话</button>
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
              <h1>今天想学点什么？</h1>
              <p>告诉我你的时间、目标或正在困惑的词句。我会结合真实学习记录，帮你安排下一步。</p>
              <div>
                {["安排今天的学习", "回顾我最近的易错词", "用我的生词生成短文", "我想解释一个词或句子"].map((item) => <button key={item} onClick={() => void send(item)}>{item}</button>)}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <article className={`chat-message ${message.role}`} key={message.key}>
              <span>{message.role === "assistant" ? "知" : "我"}</span>
              <div>
                {message.role === "assistant"
                  ? <MarkdownMessage content={message.content} />
                  : message.content}
                {!message.content && streaming ? <i className="typing-dot">思考中…</i> : null}
                {!!message.actions?.length && (
                  <div className="response-actions" aria-label="快捷操作">
                    {message.actions.map((action) => {
                      const state = actionStates[`${message.key}:${action.id}`];
                      return (
                        <button
                          key={action.id}
                          disabled={state === "pending" || state === "done" || streaming}
                          onClick={() => void performAction(message.key, action)}
                        >
                          {state === "pending" ? "处理中…" : state === "done" ? "已完成" : action.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
