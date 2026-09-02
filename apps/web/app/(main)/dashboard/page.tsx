"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookMarked, BookOpenText, ChevronRight, Flame, LibraryBig, Send, Sparkles } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import type { Article, Dashboard } from "@/lib/types";

const ratingLabels: Record<string, string> = { again: "需要再见", hard: "有点困难", good: "已经认识", easy: "非常熟悉" };

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [prompt, setPrompt] = useState("");
  const router = useRouter();

  useEffect(() => {
    Promise.all([api<Dashboard>("/dashboard"), api<Article[]>("/articles")]).then(([dashboard, list]) => {
      setData(dashboard);
      setArticles(list.slice(0, 2));
    });
  }, []);

  if (!data) return <InlineLoader />;
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  function ask(event: FormEvent) {
    event.preventDefault();
    if (prompt.trim()) router.push(`/assistant?message=${encodeURIComponent(prompt.trim())}`);
  }

  return (
    <div className="page dashboard-page">
      <header className="page-header dashboard-header">
        <div><span className="eyebrow">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span><h1>{greeting}，{user?.nickname}</h1><p>不必学得很多，记得回来就好。</p></div>
        <div className="streak-pill"><Flame size={20} fill="currentColor" /><strong>{data.streak_days}</strong><span>天连续学习</span></div>
      </header>

      <section className="ai-home-card">
        <div className="ai-home-heading"><span><Sparkles size={20} /></span><div><strong>知闲 AI</strong><small>问学习记录、制定复习计划，也可以直接让我帮你操作</small></div></div>
        <form onSubmit={ask} className="ai-home-composer">
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：昨天复习了哪些词？把 wander 加入旅行生词本" rows={2} />
          <button type="submit" aria-label="发送给知闲 AI"><Send size={18} /></button>
        </form>
        <div className="ai-home-prompts">
          {["今天复习什么？", "分析我最近的易错词", "生成一篇 B1 短文", "开始学习"].map((item) => <button key={item} onClick={() => router.push(`/assistant?message=${encodeURIComponent(item)}`)}>{item}</button>)}
        </div>
      </section>

      <section className="today-hero">
        <div className="hero-copy"><span className="eyebrow light-text">TODAY&apos;S PRACTICE</span><h2>今天，从 {data.due_today || "几"} 个词开始</h2><p>{data.due_today > 0 ? `有 ${data.due_today} 个单词等待复习。花十分钟，让记忆重新清晰。` : "复习已清空，可以认识一些新词，给今天留一点新鲜感。"}</p><Link href="/learn" className="cream-button">开始学习 <ChevronRight size={18} /></Link></div>
        <div className="hero-orbit" aria-hidden="true"><span className="orbit-word one">remember</span><span className="orbit-word two">notice</span><span className="orbit-word three">grow</span><span className="orbit-center">{data.studied_today}<small>今日已学</small></span></div>
      </section>

      <section className="stat-grid" aria-label="学习统计">
        <article><BookOpenText size={21} /><div><strong>{data.studied_today}</strong><span>今日学习</span></div><small>次复习记录</small></article>
        <article><Sparkles size={21} /><div><strong>{data.mastered_words}</strong><span>已经掌握</span></div><small>继续积累中</small></article>
        <article><BookMarked size={21} /><div><strong>{data.vocabulary_count}</strong><span>生词本</span></div><Link href="/vocabulary">查看全部</Link></article>
      </section>

      <div className="dashboard-columns">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">YOUR WORDS</span><h2>当前词书</h2></div><Link href="/wordbooks">更换词书 <ChevronRight size={16} /></Link></div>
          {data.current_wordbook ? <article className="wordbook-row"><div className="book-cover" style={{ background: data.current_wordbook.cover_color }}><span>知闲</span><strong>{data.current_wordbook.name.replace("知闲 · ", "")}</strong></div><div className="book-info"><span className="tag">{data.current_wordbook.level}</span><h3>{data.current_wordbook.name}</h3><p>{data.current_wordbook.description}</p><div className="progress-line"><i style={{ width: `${Math.round((data.current_wordbook.learned_count / Math.max(data.current_wordbook.word_count, 1)) * 100)}%` }} /></div><small>已学习 {data.current_wordbook.learned_count} / {data.current_wordbook.word_count} 词</small></div></article> : <div className="soft-card"><p>还没有选择词书。</p><Link href="/wordbooks" className="text-link">去挑一本</Link></div>}
        </section>

        <section className="content-section activity-section">
          <div className="section-heading"><div><span className="eyebrow">RECENT</span><h2>最近复习</h2></div></div>
          {data.recent_activity.length ? <div className="activity-list">{data.recent_activity.map((item, index) => <div key={`${item.word}-${index}`}><span className="activity-dot" /><div><strong>{item.word}</strong><small>{item.translation}</small></div><em>{ratingLabels[item.rating]}</em></div>)}</div> : <div className="quiet-empty"><p>今天还没有复习记录。</p><Link href="/learn">开始第一个单词</Link></div>}
        </section>
      </div>

      <section className="content-section reading-preview">
        <div className="section-heading"><div><span className="eyebrow">READ A LITTLE</span><h2>读一点，再多懂一点</h2></div><Link href="/articles">所有文章 <ChevronRight size={16} /></Link></div>
        <div className="article-mini-grid">{articles.map((article) => <Link href={`/articles/${article.id}`} className={`article-mini ${article.cover_gradient}`} key={article.id}><div><span>{article.topic}</span><small>{article.level} · {article.read_minutes} 分钟</small></div><h3>{article.title}</h3><p>{article.title_zh}</p><LibraryBig size={22} /></Link>)}</div>
      </section>
    </div>
  );
}
