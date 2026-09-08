"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, Quote, Search, Sparkles, Trash2, X } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { ApiError, api } from "@/lib/api";
import type { SentenceCollectionItem } from "@/lib/types";

export default function SentencesPage() {
  const [items, setItems] = useState<SentenceCollectionItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const [translation, setTranslation] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const page = await api<{ items: SentenceCollectionItem[] }>(`/sentences?q=${encodeURIComponent(query)}&source=${source}`);
      setItems(page.items); setError("");
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "句子加载失败"); }
  }, [query, source]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 180); return () => window.clearTimeout(timer); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/sentences", { method: "POST", body: JSON.stringify({ text, translation }) });
      setText(""); setTranslation(""); setCreating(false); await load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "收藏失败"); }
  }
  async function remove(id: number) { await api(`/sentences/${id}`, { method: "DELETE" }); await load(); }
  async function saveNote(item: SentenceCollectionItem, note: string) {
    await api(`/sentences/${item.id}`, { method: "PATCH", body: JSON.stringify({ translation: item.translation, note, tags: item.tags }) });
    setItems((current) => current?.map((value) => value.id === item.id ? { ...value, note } : value) || null);
  }
  return <div className="page workspace-page">
    <header className="workspace-heading"><div><h1>句子收藏</h1><p>保存文章中的表达，也可以手动加入自己的句子。示例收藏可自由编辑或删除。</p></div><button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> 添加句子</button></header>
    <div className="sentence-toolbar"><div className="search-box compact"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索原文、译文或笔记" />{query && <button onClick={() => setQuery("")} aria-label="清空搜索"><X size={16} /></button>}</div><select value={source} onChange={(event) => setSource(event.target.value)} aria-label="按来源筛选"><option value="all">全部来源</option><option value="article">来自文章</option><option value="manual">手动收藏</option><option value="ai">来自 AI</option><option value="example">示例收藏</option></select></div>
    {creating && <form className="sentence-create" onSubmit={create}><label>英文原文<textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} required /></label><label>中文译文（可选）<textarea value={translation} onChange={(event) => setTranslation(event.target.value)} /></label><div><button className="primary-button">保存句子</button><button className="secondary-button" type="button" onClick={() => setCreating(false)}>取消</button></div></form>}
    {error && <p className="workspace-error" role="alert">{error}</p>}
    {!items ? <InlineLoader /> : <div className="sentence-collection-list">{items.map((item) => <article key={item.id}>
      <div className="sentence-source"><span>{item.is_example ? "示例收藏" : item.source_type === "article" ? "文章" : item.source_type === "ai" ? "AI 对话" : "手动收藏"}</span><time>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(item.created_at))}</time></div>
      <blockquote>{item.text}</blockquote>{item.translation && <p className="collected-translation">{item.translation}</p>}
      <div className="sentence-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <label className="sentence-note">我的笔记<textarea value={item.note} onChange={(event) => setItems((current) => current?.map((value) => value.id === item.id ? { ...value, note: event.target.value } : value) || null)} onBlur={(event) => void saveNote(item, event.target.value)} placeholder="记下为什么收藏、适用语境或自己的例句" /></label>
      <div className="sentence-card-actions">{item.article_id && <Link href={`/articles/${item.article_id}`}>返回出处</Link>}<Link href={`/assistant?message=${encodeURIComponent(`请解释这个句子，并给我一个能实际使用的例子：${item.text}`)}`}><Sparkles size={15} /> 询问 AI</Link><button onClick={() => remove(item.id)}><Trash2 size={15} /> 删除</button></div>
    </article>)}</div>}
    {items?.length === 0 && <div className="workspace-empty"><Quote size={28} /><h2>{query ? "没有匹配的收藏" : "还没有句子收藏"}</h2><p>{query ? "换一个关键词或来源筛选试试。" : "阅读时划选一段文字，或在这里手动加入句子。"}</p></div>}
  </div>;
}
