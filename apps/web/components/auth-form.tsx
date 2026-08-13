"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth-context";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const [email, setEmail] = useState(mode === "login" && demoMode ? "demo@zhixian.app" : "");
  const [password, setPassword] = useState(mode === "login" && demoMode ? "Demo1234!" : "");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isLogin = mode === "login";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (isLogin) await login(email, password);
      else await register(email, password, nickname);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-form-wrap">
      <div className="auth-heading">
        <span className="eyebrow">{isLogin ? "WELCOME BACK" : "BEGIN YOUR JOURNEY"}</span>
        <h2>{isLogin ? "回来继续，今天的积累" : "从今天开始，认识更多表达"}</h2>
        <p>{isLogin ? "登录后继续你的词汇与阅读计划。" : "创建账号，学习记录会安全保存在你的空间中。"}</p>
      </div>
      <form onSubmit={submit} className="auth-form">
        {!isLogin && <label>昵称<input value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={80} placeholder="希望怎么称呼你" autoComplete="nickname" /></label>}
        <label>邮箱<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email" /></label>
        <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={72} placeholder="至少 8 位" autoComplete={isLogin ? "current-password" : "new-password"} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button wide" disabled={submitting}>{submitting ? "请稍候…" : isLogin ? "进入知闲" : "创建账号"}</button>
      </form>
      <p className="auth-switch">{isLogin ? "第一次来知闲？" : "已经有账号？"}<Link href={isLogin ? "/register" : "/login"}>{isLogin ? "创建账号" : "直接登录"}</Link></p>
      {isLogin && demoMode && <div className="demo-note"><strong>演示账号已填入</strong><span>点击“进入知闲”即可体验完整学习流程</span></div>}
    </div>
  );
}
