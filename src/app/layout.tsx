import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MiTV 控制中心",
  description: "Redmi G Pro 27U 显示器操控中心",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MiTV 控制中心", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#131318" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="mtv min-h-full">{children}</body>
    </html>
  );
}
