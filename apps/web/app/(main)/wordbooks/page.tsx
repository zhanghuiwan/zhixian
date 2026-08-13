"use client";

import { useEffect, useState } from "react";
import { BookOpenText } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { api } from "@/lib/api";
import type { Wordbook } from "@/lib/types";

export default function WordbooksPage() {
  const [books, setBooks] = useState<Wordbook[] | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null);

  async function load() { setBooks(await api<Wordbook[]>("/wordbooks")); }
  useEffect(() => { load(); }, []);

  async function selectBook(id: number) {
    setSelecting(id);
    await api(`/wordbooks/${id}/select`, { method: "POST" });
    await load();
    setSelecting(null);
  }

  if (!books) return <InlineLoader />;
  return (
    <div className="page narrow-page">
      <header className="page-header"><div><span className="eyebrow">WORD COLLECTIONS</span><h1>选择你的词书</h1><p>先建立一条清晰的学习路径，阅读中遇见的生词会单独收进生词本。</p></div></header>
      <div className="wordbook-grid">
        {books.map((book) => {
          const percent = Math.round((book.learned_count / Math.max(book.word_count, 1)) * 100);
          return <article className={`wordbook-card ${book.is_selected ? "selected" : ""}`} key={book.id}>
            <div className="large-book-cover" style={{ background: book.cover_color }}><span>ZHIXIAN WORDS</span><BookOpenText size={28} strokeWidth={1.4} /><strong>{book.name.replace("知闲 · ", "")}</strong><small>{book.level}</small></div>
            <div className="wordbook-card-body"><div className="book-title-line"><h2>{book.name}</h2>{book.is_selected && <span className="selected-badge">正在学习</span>}</div><p>{book.description}</p><div className="progress-label"><span>学习进度</span><strong>{percent}%</strong></div><div className="progress-line"><i style={{ width: `${percent}%` }} /></div><div className="book-numbers"><span><strong>{book.word_count}</strong> 总词数</span><span><strong>{book.learned_count}</strong> 已学习</span><span><strong>{book.mastered_count}</strong> 已掌握</span></div><button className={book.is_selected ? "secondary-button wide" : "primary-button wide"} disabled={book.is_selected || selecting === book.id} onClick={() => selectBook(book.id)}>{book.is_selected ? "当前词书" : selecting === book.id ? "正在选择…" : "选择这本词书"}</button></div>
          </article>;
        })}
      </div>
    </div>
  );
}

