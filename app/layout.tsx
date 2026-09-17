import type { Metadata } from "next";
import "highlight.js/styles/github.css";
import "./globals.css";
import "../styles/tokens.css";
import "../components/design-system/patterns/MobileBlogEditor.css";
import "./composer-layout.css";
import "../components/design-system/patterns/MobileComposer.css";
import "../components/design-system/patterns/FullPageBlogEditor.css";
import "../components/design-system/patterns/LinkPreview.css";
import "../components/design-system/patterns/DetailActions.css";
import "./brand-theme.css";
import "./mobile-nav-layout.css";
import "../components/design-system/patterns/ProfileSocialLinks.css";
import "./federation.css";
import { BlogTableOfContentsBridge } from "@/components/blog-table-of-contents-bridge";
import { ImageUploadBridge } from "@/components/image-upload-bridge";
import { NavigationUrlBridge } from "@/components/navigation-url-bridge";
import { ProfileSocialLinksBridge } from "@/components/profile-social-links-bridge";
import { TweetLinkPreviewBridge } from "@/components/tweet-link-preview-bridge";
import {
  homeUrl,
  ogImageUrl,
  SITE_DESCRIPTION,
  SITE_TITLE,
  siteOrigin,
} from "@/server/seo.mjs";

const canonical = homeUrl();
const image = ogImageUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: "kamelog",
    type: "website",
    url: canonical,
    images: [{ url: image, width: 1200, height: 630, alt: "kamelog" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
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
        <NavigationUrlBridge />
        <ImageUploadBridge />
        <BlogTableOfContentsBridge />
        <TweetLinkPreviewBridge />
        <ProfileSocialLinksBridge />
        {children}
      </body>
    </html>
  );
}
