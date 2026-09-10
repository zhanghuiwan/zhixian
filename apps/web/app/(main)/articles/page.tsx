"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpenText, ChevronRight } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { ApiError, api } from "@/lib/api";
import type { Article } from "@/lib/types";

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  useEffect(() => { api<Article[]>("/articles").then(setArticles).catch((cause) => setError(cause instanceof ApiError ? cause.message : "文章加载失败")); }, []);
  if (!articles && !error) return <InlineLoader />;
  const list = (articles || []).filter((article) => filter === "all" || filter === "continue" && article.progress > 0 && !article.is_completed || filter === "mine" && article.is_private || filter === "finished" && article.is_completed);
  return <div className="page workspace-page reading-library">
    <header className="workspace-heading"><div><h1>阅读</h1><p>在连续正文中划选翻译、查词和收藏，文章 AI 会保留当前语境。</p></div></header>
    <div className="workspace-tabs" role="tablist" aria-label="文章筛选"><button role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")}>推荐文章</button><button role="tab" aria-selected={filter === "continue"} onClick={() => setFilter("continue")}>继续阅读</button><button role="tab" aria-selected={filter === "mine"} onClick={() => setFilter("mine")}>我的文章</button><button role="tab" aria-selected={filter === "finished"} onClick={() => setFilter("finished")}>已读完</button></div>
    {error && <p className="workspace-error">{error}</p>}
    <section className="reading-list">{list.map((article, index) => <Link href={`/articles/${article.id}`} key={article.id} className="reading-row"><div className={`reading-index ${article.cover_gradient}`}><span>{String(index + 1).padStart(2, "0")}</span><BookOpenText size={22} /></div><div><span>{article.topic} · {article.read_minutes} 分钟{article.is_private ? " · AI 草稿" : ""}</span><h2>{article.title}</h2><h3>{article.title_zh}</h3><p>{article.summary}</p>{article.progress > 0 && <div className="reading-progress"><i style={{ width: `${article.progress}%` }} /><span>{article.is_completed ? "已读完" : `${article.progress}%`}</span></div>}</div><ChevronRight size={20} /></Link>)}</section>
    {!list.length && <div className="workspace-empty"><BookOpenText size={28} /><h2>这里还没有文章</h2><p>{filter === "mine" ? "让 AI 按你的兴趣和当前学习语境生成一篇文章，它会出现在这里。" : "完成一次阅读后，文章会出现在对应列表。"}</p>{filter === "mine" && <Link className="primary-button" href="/assistant?message=请结合我的兴趣生成一篇适合精读的短文">让 AI 生成文章</Link>}</div>}
  </div>;
}
