import type { Metadata } from "next";
import "highlight.js/styles/github.css";
import "./globals.css";
import "./mobile-blog-editor.css";
import "./x-share-logo.css";
import "./composer-layout.css";
import "./full-page-blog-editor.css";
import { ImageUploadBridge } from "@/components/image-upload-bridge";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.KAMELOG_ORIGIN || "http://localhost:3000"),
  title: "kamelog",
  description: "ブログ、つぶやき、vlogをまとめる個人サイト。",
  openGraph: {
    title: "kamelog",
    description: "ブログ、つぶやき、vlogをまとめる個人サイト。",
    siteName: "kamelog",
    type: "website",
    images: [{ url: "/og", width: 1200, height: 630, alt: "kamelog" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "kamelog",
    description: "ブログ、つぶやき、vlogをまとめる個人サイト。",
    images: ["/og"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <ImageUploadBridge />
        {children}
      </body>
    </html>
  );
}
