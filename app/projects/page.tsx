import type { Metadata } from "next";
import SitePage from "../site-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "プロジェクト | kamelog",
  description: "かめさんの個人開発と運用の記録。",
  alternates: { canonical: "/projects" },
  openGraph: {
    title: "プロジェクト | kamelog",
    description: "かめさんの個人開発と運用の記録。",
    siteName: "kamelog",
    type: "website",
    url: "/projects",
  },
};

export default function ProjectsPage() {
  return <SitePage />;
}
