import type { Metadata } from "next";
import Link from "next/link";
import { projects } from "@/lib/public-profile";
import "../engineering.css";

export const metadata: Metadata = {
  title: "Projects | kamelog",
  description: "かめさんの個人開発と運用の記録",
  alternates: { canonical: "/projects" },
};

export default function ProjectsPage() {
  return (
    <main className="project-article">
      <Link href="/">← kamelog</Link>
      <h1>Projects</h1>
      <p>設計から実装、運用まで取り組んだもの。</p>
      <div className="engineering-works">
        {projects.map((project) => {
          const card = (
            <>
              <strong>{project.title}</strong>
              <span>{project.summary}</span>
              <small>
                {project.links.source
                  ? "GitHubで見る ↗"
                  : "詳細はこのページに掲載"}
              </small>
            </>
          );
          return project.links.source ? (
            <a
              key={project.slug}
              href={project.links.source}
              target="_blank"
              rel="noreferrer"
            >
              {card}
            </a>
          ) : (
            <div className="engineering-work-static" key={project.slug}>
              {card}
            </div>
          );
        })}
      </div>
    </main>
  );
}
