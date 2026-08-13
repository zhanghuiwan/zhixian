"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpenText, ChevronRight } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { api } from "@/lib/api";
import type { Article } from "@/lib/types";

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [filter, setFilter] = useState("全部");
  useEffect(() => { api<Article[]>("/articles").then(setArticles); }, []);
  if (!articles) return <InlineLoader />;
  const topics = ["全部", ...Array.from(new Set(articles.map((item) => item.topic)))];
  const filtered = filter === "全部" ? articles : articles.filter((item) => item.topic === filter);
  const featured = filtered[0];
  return (
    <div className="page articles-page">
      <header className="page-header"><div><span className="eyebrow">READING ROOM</span><h1>阅读室</h1><p>不要急着翻译整篇。先读懂一个句子，再认识一个新的表达。</p></div></header>
      <div className="filter-tabs" role="tablist">{topics.map((topic) => <button role="tab" aria-selected={filter === topic} className={filter === topic ? "active" : ""} onClick={() => setFilter(topic)} key={topic}>{topic}</button>)}</div>
      {featured && <Link href={`/articles/${featured.id}`} className={`featured-article ${featured.cover_gradient}`}><div className="feature-copy"><span className="eyebrow light-text">FEATURED READING</span><h2>{featured.title}</h2><h3>{featured.title_zh}</h3><p>{featured.summary}</p><div><span>{featured.topic}</span><span>{featured.level}</span><span>{featured.read_minutes} 分钟</span></div><strong>开始阅读 <ChevronRight size={18} /></strong></div><div className="feature-art" aria-hidden="true"><i /><i /><i /><BookOpenText size={40} strokeWidth={1.2} /></div></Link>}
      <div className="article-grid">{filtered.slice(1).map((article, index) => <Link href={`/articles/${article.id}`} className="article-card" key={article.id}><div className={`article-card-art ${article.cover_gradient}`}><span>{String(index + 2).padStart(2, "0")}</span><BookOpenText size={27} strokeWidth={1.3} /></div><div className="article-card-body"><div className="article-meta"><span>{article.topic}</span><span>{article.level} · {article.read_minutes} 分钟</span></div><h2>{article.title}</h2><h3>{article.title_zh}</h3><p>{article.summary}</p><strong>阅读全文 <ChevronRight size={16} /></strong></div></Link>)}</div>
    </div>
  );
}

