"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, CalendarDays, LogOut, Sparkles } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";

const nav = [
  { href: "/dashboard", label: "AI 对话", icon: Sparkles },
  { href: "/study", label: "学习", icon: BookOpenText },
  { href: "/records", label: "记录", icon: CalendarDays },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href || pathname.startsWith("/assistant");
  }
  if (href === "/study") {
    return ["/study", "/learn", "/wordbooks", "/vocabulary", "/articles", "/sentences"]
      .some((path) => pathname === path || pathname.startsWith(`${path}/`));
  }
  return pathname === href;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  if (loading || !user) {
    return <div className="page-loader"><span className="brand-mark">知</span><span>稍候片刻…</span></div>;
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand" aria-label="知闲首页">
          <span className="brand-mark">知</span>
          <span><strong>知闲</strong><small>ZHIXIAN</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="主要导航">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={20} strokeWidth={1.8} /><span>{label}</span></Link>;
          })}
        </nav>
        <div className="sidebar-foot">
          <Link className="mini-profile" href="/profile" title="打开个人设置"><span>{user.nickname.slice(0, 1)}</span><div><strong>{user.nickname}</strong><small>每日 {user.daily_new_words} 个新词</small></div></Link>
          <button className="icon-button" onClick={logout} title="退出登录" aria-label="退出登录"><LogOut size={18} /></button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <nav className="mobile-nav" aria-label="移动端主要导航">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={21} strokeWidth={1.8} /><span>{label}</span></Link>;
        })}
      </nav>
    </div>
  );
}
