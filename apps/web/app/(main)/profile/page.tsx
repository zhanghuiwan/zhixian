"use client";

import { FormEvent, useEffect, useState } from "react";
import { AIProviderSettings } from "@/components/ai-provider-settings";
import { LogOut } from "@/components/icons";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const [nickname, setNickname] = useState("");
  const [daily, setDaily] = useState(10);
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) {
      setNickname(user.nickname);
      setDaily(user.daily_new_words);
      setTimezone(user.timezone);
    }
  }, [user]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    await api("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ nickname, daily_new_words: daily, timezone }),
    });
    await refreshUser();
    setMessage("设置已保存");
  }

  return (
    <div className="page profile-page narrow-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">YOUR SPACE</span>
          <h1>我的知闲</h1>
          <p>调整学习节奏和 AI 模型。目标可以小，但要适合每天回来。</p>
        </div>
      </header>

      <div className="profile-layout">
        <section className="profile-card">
          <div className="profile-avatar">{user?.nickname.slice(0, 1)}</div>
          <h2>{user?.nickname}</h2>
          <p>{user?.email}</p>
          <span>
            加入于 {user && new Intl.DateTimeFormat("zh-CN", {
              year: "numeric",
              month: "long",
            }).format(new Date(user.created_at))}
          </span>
          <button className="secondary-button" onClick={logout}>
            <LogOut size={17} />退出登录
          </button>
        </section>

        <form className="settings-card" onSubmit={save}>
          <div>
            <span className="eyebrow">LEARNING PACE</span>
            <h2>学习设置</h2>
          </div>
          <label>
            昵称
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} required />
          </label>
          <label>
            每日新词数量
            <div className="range-field">
              <input type="range" min="1" max="30" value={daily} onChange={(event) => setDaily(Number(event.target.value))} />
              <strong>{daily} 词</strong>
            </div>
          </label>
          <label>
            学习日期时区
            <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              <option value="Asia/Shanghai">中国标准时间（上海）</option>
              <option value="Asia/Hong_Kong">香港时间</option>
              <option value="Asia/Tokyo">日本时间（东京）</option>
              <option value="Europe/London">英国时间（伦敦）</option>
              <option value="America/New_York">美国东部时间（纽约）</option>
              <option value="America/Los_Angeles">美国西部时间（洛杉矶）</option>
            </select>
          </label>
          {message && <p className="success-message">{message}</p>}
          <button className="primary-button" type="submit">保存设置</button>
        </form>
      </div>

      <AIProviderSettings />
    </div>
  );
}
