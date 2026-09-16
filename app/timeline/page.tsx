import type { Metadata } from "next";
import SitePage from "../site-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "タイムライン | kamelog",
  description: "かめさんのブログ、つぶやき、vlogをまとめたタイムライン。",
  alternates: { canonical: "/timeline" },
  openGraph: {
    title: "タイムライン | kamelog",
    description: "かめさんのブログ、つぶやき、vlogをまとめたタイムライン。",
    siteName: "kamelog",
    type: "website",
    url: "/timeline",
  },
};

export default function TimelinePage() {
  return <SitePage />;
}
