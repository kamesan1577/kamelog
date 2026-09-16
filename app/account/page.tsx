import type { Metadata } from "next";
import SitePage from "../site-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "アカウント | kamelog",
  description: "かめさんのプロフィールとアカウント情報。",
  alternates: { canonical: "/account" },
  openGraph: {
    title: "アカウント | kamelog",
    description: "かめさんのプロフィールとアカウント情報。",
    siteName: "kamelog",
    type: "website",
    url: "/account",
  },
};

export default function AccountPage() {
  return <SitePage />;
}
