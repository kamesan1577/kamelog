import type { Metadata } from "next";
import "highlight.js/styles/github.css";
import "./globals.css";
import "./mobile-blog-editor.css";
import "./x-share-logo.css";
import "./composer-layout.css";
import "./full-page-blog-editor.css";
import { ImageUploadBridge } from "@/components/image-upload-bridge";
import { homeUrl, ogImageUrl, siteOrigin } from "@/server/seo.mjs";

const canonical = homeUrl();
const image = ogImageUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "kamelog",
  description: "ブログ、つぶやき、vlogをまとめる個人サイト。",
  alternates: { canonical },
  openGraph: {
    title: "kamelog",
    description: "ブログ、つぶやき、vlogをまとめる個人サイト。",
    siteName: "kamelog",
    type: "website",
    url: canonical,
    images: [{ url: image, width: 1200, height: 630, alt: "kamelog" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "kamelog",
    description: "ブログ、つぶやき、vlogをまとめる個人サイト。",
    images: [image],
  },
  other: { "twitter:url": canonical },
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
