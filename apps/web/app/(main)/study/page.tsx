"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookMarked, BookOpenText, CalendarDays, LibraryBig, Quote } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { ApiError, api } from "@/lib/api";
import type { Dashboard, LibraryBook } from "@/lib/types";

const entrances = [
  { href: "/wordbooks", title: "词书", description: "选择系统词书或管理个人词书", icon: BookOpenText },
  { href: "/articles", title: "阅读", description: "精读文章、查词与逐句翻译", icon: LibraryBig },
  { href: "/sentences", title: "收藏句子", description: "回看值得积累的表达", icon: Quote },
  { href: "/vocabulary", title: "我的单词", description: "系统词和我的新增词条", icon: BookMarked },
];

export default function StudyPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<Dashboard>("/dashboard"), api<LibraryBook[]>("/library")])
      .then(([dashboardData, bookData]) => {
        setDashboard(dashboardData);
        setBooks(bookData);
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : "学习信息加载失败"));
  }, []);

  if (!dashboard || !books) {
    return error ? <div className="empty-state"><strong>学习入口暂时无法加载</strong><span>{error}</span></div> : <InlineLoader />;
  }

  const selected = books.find((book) => book.kind === "personal" && book.is_selected)
    || books.find((book) => book.kind === "system" && book.is_selected);
  const startHref = selected
    ? `/learn?kind=${selected.kind}&source_id=${selected.id}&mode=all`
    : "/learn";
  const newHref = selected
    ? `/learn?kind=${selected.kind}&source_id=${selected.id}&mode=new`
    : "/wordbooks";

  return (
    <div className="page workspace-page study-hub">
      <header className="study-hub-hero">
        <div>
          <span className="eyebrow">TODAY&apos;S LEARNING</span>
          <h1>开始今天的学习</h1>
          <p>{selected ? `当前词书：${selected.name}` : "从综合复习开始，系统会衔接你的学习进度。"}</p>
          <Link className="primary-button" href={startHref}>开始学习</Link>
        </div>
        <div className="study-hub-metrics">
          <span><strong>{dashboard.due_today}</strong>待复习</span>
          <span><strong>{dashboard.studied_today}</strong>今日已学</span>
          <span><strong>{dashboard.streak_days}</strong>连续天数</span>
        </div>
      </header>

      <section className="today-study-grid" aria-label="今日单词学习">
        <Link href={newHref} className="today-study-card new-words">
          <span>新学</span>
          <div><h2>学习新词</h2><p>{selected ? `${selected.name} · 还有 ${Math.max(0, selected.word_count - selected.learned_count)} 词未学习` : "先选择一本词书"}</p></div>
          <strong>开始</strong>
        </Link>
        <Link href="/learn?mode=review" className={`today-study-card review-words ${dashboard.due_today === 0 ? "quiet" : ""}`}>
          <span>复习</span>
          <div><h2>到期复习</h2><p>{dashboard.due_today > 0 ? `今天有 ${dashboard.due_today} 个单词需要复习` : "当前没有到期单词"}</p></div>
          <strong>{dashboard.due_today > 0 ? "开始" : "查看"}</strong>
        </Link>
      </section>

      <section className="study-entrances" aria-label="学习内容">
        {entrances.map(({ href, title, description, icon: Icon }) => (
          <Link href={href} key={href}>
            <span><Icon size={22} /></span>
            <div><h2>{title}</h2><p>{description}</p></div>
          </Link>
        ))}
      </section>

      <Link className="study-record-link" href="/records">
        <CalendarDays size={18} /> 查看学习日历和历史记录
      </Link>
    </div>
  );
}
