"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, BookOpenText, CircleUserRound, LibraryBig, LogOut, Sparkles } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";

const nav = [
  { href: "/dashboard", label: "知闲 AI", icon: Sparkles },
  { href: "/learn", label: "学词", icon: BookOpenText },
  { href: "/articles", label: "阅读", icon: LibraryBig },
  { href: "/vocabulary", label: "生词", icon: BookMarked },
  { href: "/profile", label: "我的", icon: CircleUserRound },
];

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
            const active = pathname === href || (href === "/dashboard" && pathname.startsWith("/assistant")) || (href === "/articles" && pathname.startsWith("/articles/"));
            return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={20} strokeWidth={1.8} /><span>{label}</span></Link>;
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="mini-profile"><span>{user.nickname.slice(0, 1)}</span><div><strong>{user.nickname}</strong><small>{user.level} · 每日 {user.daily_new_words} 词</small></div></div>
          <button className="icon-button" onClick={logout} title="退出登录" aria-label="退出登录"><LogOut size={18} /></button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <nav className="mobile-nav" aria-label="移动端主要导航">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/dashboard" && pathname.startsWith("/assistant")) || (href === "/articles" && pathname.startsWith("/articles/"));
          return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={21} strokeWidth={1.8} /><span>{label}</span></Link>;
        })}
      </nav>
    </div>
  );
}
