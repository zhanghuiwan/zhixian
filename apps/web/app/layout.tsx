import type { Metadata, Viewport } from "next";
import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/newsreader";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: { default: "知闲 · 在阅读中学会英语", template: "%s · 知闲" },
  description: "以词汇、阅读和科学复习构成的轻量英语学习空间。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f1e8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

