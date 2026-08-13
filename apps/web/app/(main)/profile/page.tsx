"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { LogOut } from "@/components/icons";

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const [nickname, setNickname] = useState("");
  const [level, setLevel] = useState("B1");
  const [daily, setDaily] = useState(10);
  const [message, setMessage] = useState("");
  useEffect(() => { if (user) { setNickname(user.nickname); setLevel(user.level); setDaily(user.daily_new_words); } }, [user]);
  async function save(event: FormEvent) { event.preventDefault(); setMessage(""); await api("/users/me", { method: "PATCH", body: JSON.stringify({ nickname, level, daily_new_words: daily }) }); await refreshUser(); setMessage("设置已保存"); }
  return (
    <div className="page profile-page narrow-page"><header className="page-header"><div><span className="eyebrow">YOUR SPACE</span><h1>我的知闲</h1><p>调整学习节奏。目标可以小，但要适合每天回来。</p></div></header><div className="profile-layout"><section className="profile-card"><div className="profile-avatar">{user?.nickname.slice(0, 1)}</div><h2>{user?.nickname}</h2><p>{user?.email}</p><span>加入于 {user && new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(new Date(user.created_at))}</span><button className="secondary-button" onClick={logout}><LogOut size={17} />退出登录</button></section><form className="settings-card" onSubmit={save}><div><span className="eyebrow">LEARNING PACE</span><h2>学习设置</h2></div><label>昵称<input value={nickname} onChange={(event) => setNickname(event.target.value)} required /></label><label>当前英语水平<select value={level} onChange={(event) => setLevel(event.target.value)}>{["A1", "A2", "B1", "B2", "C1", "C2"].map((item) => <option key={item}>{item}</option>)}</select></label><label>每日新词数量<div className="range-field"><input type="range" min="1" max="30" value={daily} onChange={(event) => setDaily(Number(event.target.value))} /><strong>{daily} 词</strong></div></label>{message && <p className="success-message">{message}</p>}<button className="primary-button" type="submit">保存设置</button></form></div></div>
  );
}

