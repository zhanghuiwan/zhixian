"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { BookOpenText, Plus, X } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { ApiError, api } from "@/lib/api";
import type { LibraryBook } from "@/lib/types";

export default function WordbooksPage() {
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [tab, setTab] = useState<"system" | "personal">("system");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  async function load() { setBooks(await api<LibraryBook[]>("/library")); }
  useEffect(() => { load().catch((cause) => setError(cause instanceof ApiError ? cause.message : "词书加载失败")); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const book = await api<LibraryBook>("/library/personal", { method: "POST", body: JSON.stringify({ name, description }) });
      setName(""); setDescription(""); setCreating(false); setTab("personal"); await load();
      window.setTimeout(() => document.getElementById(`book-${book.kind}-${book.id}`)?.focus(), 0);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "创建失败"); }
  }

  if (!books) return <InlineLoader />;
  const current = books.filter((book) => book.kind === tab);
  return (
    <div className="page workspace-page">
      <header className="workspace-heading"><div><h1>词书</h1><p>系统词书共享同一份词典和掌握进度。个人词书可以收集阅读和对话中遇到的单词。</p></div><div className="button-row"><Link className="secondary-button" href="/vocabulary?origin=custom">我的新增单词</Link><button className="primary-button" onClick={() => { setTab("personal"); setCreating(true); }}><Plus size={17} /> 新建词书</button></div></header>
      <div className="workspace-tabs" role="tablist" aria-label="词书类型">
        <button role="tab" aria-selected={tab === "system"} onClick={() => setTab("system")}>系统词书 <span>{books.filter((b) => b.kind === "system").length}</span></button>
        <button role="tab" aria-selected={tab === "personal"} onClick={() => setTab("personal")}>我的词书 <span>{books.filter((b) => b.kind === "personal").length}</span></button>
      </div>
      {error && <p className="workspace-error" role="alert">{error}</p>}
      {creating && <form className="create-book-form" onSubmit={create}><div><label htmlFor="book-name">词书名称</label><input id="book-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></div><div><label htmlFor="book-description">用途说明</label><input id="book-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} placeholder="例如：旅行中常用的表达" /></div><button className="primary-button" type="submit">创建词书</button><button className="icon-button" type="button" onClick={() => setCreating(false)} aria-label="取消创建"><X size={18} /></button></form>}
      <section className="library-list" aria-live="polite">
        {current.map((book) => {
          const percent = Math.round((book.learned_count / Math.max(book.word_count, 1)) * 100);
          return <article className={`library-row ${book.is_selected ? "selected" : ""}`} key={`${book.kind}-${book.id}`}>
            <div className="library-cover" style={{ background: book.cover_color }}><BookOpenText size={24} /><strong>{book.name.replace("知闲 · ", "")}</strong><span>{book.kind === "system" ? "系统预设" : book.is_default ? "默认生词本" : "个人词书"}</span></div>
            <div className="library-info"><div className="library-title"><h2>{book.name}</h2>{book.is_selected && <span>正在学习</span>}</div><p>{book.description}</p><div className="library-stats"><span><strong>{book.word_count}</strong> 个词</span><span><strong>{book.learned_count}</strong> 已学习</span><span><strong>{book.due_count}</strong> 待复习</span></div><div className="library-progress"><i style={{ width: `${percent}%` }} /><span>{percent}%</span></div></div>
            <div className="library-actions"><Link id={`book-${book.kind}-${book.id}`} href={`/wordbooks/${book.kind}/${book.id}`} className="secondary-button">查看词书</Link><Link href={`/learn?kind=${book.kind}&source_id=${book.id}&mode=${book.due_count ? "all" : "new"}`} className="primary-button">{book.due_count ? "继续学习" : "学习新词"}</Link></div>
          </article>;
        })}
        {!current.length && <div className="workspace-empty"><BookOpenText size={28} /><h2>还没有个人词书</h2><p>创建一本词书，然后从词典添加单词。</p><button className="primary-button" onClick={() => setCreating(true)}>新建词书</button></div>}
      </section>
    </div>
  );
}
