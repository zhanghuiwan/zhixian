import type { Metadata, Viewport } from "next";
import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/newsreader";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: { default: "知闲 · AI 英语学习工作台", template: "%s · 知闲" },
  description: "以 AI 对话连接词书、阅读、句子收藏和学习记录。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f9f8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
