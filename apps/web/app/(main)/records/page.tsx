"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Sparkles } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { ApiError, api } from "@/lib/api";
import type { DayRecord, MonthRecords } from "@/lib/types";

function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function shiftMonth(value: string, amount: number) { const [year, month] = value.split("-").map(Number); return monthKey(new Date(year, month - 1 + amount, 1)); }

export default function RecordsPage() {
  const [month, setMonth] = useState(monthKey(new Date()));
  const [data, setData] = useState<MonthRecords | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api<MonthRecords>(`/records?month=${month}`).then((value) => { setData(value); setSelected((current) => current.startsWith(month) ? current : value.today.startsWith(month) ? value.today : `${month}-01`); setError(""); }).catch((cause) => setError(cause instanceof ApiError ? cause.message : "记录加载失败")); }, [month]);
  const record = useMemo(() => data?.days.find((day) => day.date === selected), [data, selected]);
  if (!data) return error ? <div className="empty-state"><strong>学习记录暂时无法加载</strong><span>{error}</span></div> : <InlineLoader />;
  const [year, mon] = month.split("-").map(Number);
  const firstWeekday = new Date(year, mon - 1, 1).getDay();
  return <div className="page workspace-page records-page">
    <header className="workspace-heading"><div><h1>学习记录</h1><p>按你的时区记录真实学习、阅读和收藏。示例内容不会计入统计。</p></div><button className="secondary-button" onClick={() => setMonth(monthKey(new Date()))}>回到本月</button></header>
    <div className="record-layout">
      <section className="calendar-panel"><header><button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月"><ChevronLeft size={18} /></button><h2>{year} 年 {mon} 月</h2><button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月"><ChevronRight size={18} /></button></header><div className="week-labels">{"日一二三四五六".split("").map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}{data.days.map((day) => { const active = day.date === selected; const hasActivity = day.word_count + day.reading_count + day.saved_words + day.saved_sentences > 0; return <button key={day.date} className={`${active ? "active" : ""} ${hasActivity ? "has-activity" : ""}`} onClick={() => setSelected(day.date)} aria-label={`${day.date}${hasActivity ? `，学习 ${day.word_count} 个词` : "，无记录"}`}><span>{Number(day.date.slice(-2))}</span>{hasActivity && <i />}</button>; })}</div><footer><CalendarDays size={16} /> 日期按 {data.timezone} 统计</footer></section>
      <DayDetail record={record} />
    </div>
  </div>;
}

function DayDetail({ record }: { record?: DayRecord }) {
  if (!record) return <section className="day-detail"><p>选择一天查看详情。</p></section>;
  const hasActivity = record.word_count + record.reading_count + record.saved_words + record.saved_sentences > 0;
  return <section className="day-detail"><header><div><span>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(new Date(`${record.date}T00:00:00Z`))}</span><h2>{hasActivity ? "这一天的学习" : "这一天还没有记录"}</h2></div>{hasActivity && <Link href={`/assistant?message=${encodeURIComponent(`请分析我 ${record.date} 的学习记录，并给出下一步建议`)}`}><Sparkles size={16} /> 让 AI 回顾</Link>}</header>
    {hasActivity && <><div className="day-metrics"><span><strong>{record.new_count}</strong>新学词</span><span><strong>{record.review_count}</strong>复习词</span><span><strong>{record.attempts}</strong>练习次数</span><span><strong>{record.reading_count}</strong>阅读文章</span></div>
      {!!record.books.length && <div className="day-section"><h3>学习词书</h3>{record.books.map((book, index) => <p key={`${book.kind}-${book.id}-${index}`}><span>{book.name}</span><strong>{book.word_count} 词</strong></p>)}</div>}
      {!!record.words.length && <div className="day-section"><h3>单词</h3><div className="record-word-list">{record.words.map((word) => <span key={word.id}><strong>{word.term}</strong>{word.translation}<em>{word.mode === "new" ? "新学" : "复习"}</em></span>)}</div></div>}
      {!!record.articles.length && <div className="day-section"><h3>阅读</h3>{record.articles.map((article) => <Link key={article.id} href={`/articles/${article.id}`}><span>{article.title}</span><strong>{article.completed ? "已读完" : `${article.percent}%`}</strong></Link>)}</div>}
      {(record.saved_words > 0 || record.saved_sentences > 0) && <p className="day-saved">当天新增 {record.saved_words} 个生词、{record.saved_sentences} 个句子收藏</p>}
    </>}
  </section>;
}
