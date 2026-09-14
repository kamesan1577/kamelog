import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { projects } from "@/lib/public-profile";
import "../../engineering.css";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = projects.find((item) => item.slug === slug);
  return project
    ? {
        title: `${project.title} | kamelog`,
        description: project.summary,
        alternates: { canonical: `/projects/${project.slug}` },
      }
    : {};
}
export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const project = projects.find((item) => item.slug === slug);
  if (!project) notFound();
  return (
    <main className="project-article">
      <Link href="/projects">← Projects</Link>
      <h1>{project.title}</h1>
      <p className="project-summary">{project.summary}</p>
      <dl>
        <div>
          <dt>担当</dt>
          <dd>{project.role}</dd>
        </div>
        {project.period && (
          <div>
            <dt>期間</dt>
            <dd>{project.period}</dd>
          </div>
        )}
        <div>
          <dt>状態</dt>
          <dd>{project.status}</dd>
        </div>
        <div>
          <dt>技術</dt>
          <dd>{project.stack.join(" · ")}</dd>
        </div>
      </dl>
      {project.slug === "home-lab" && (
        <section>
          <h2>構成</h2>
          <p className="project-architecture">
            Internet → Cloudflare → Tunnel → アプリ → ストレージ
          </p>
        </section>
      )}
      <section>
        <h2>取り組み</h2>
        <ul>
          {project.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>設計と運用</h2>
        {project.decisions.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </section>
      {(project.links.source || project.links.website) && (
        <nav aria-label="外部リンク" className="engineering-links">
          {project.links.source && (
            <a href={project.links.source} target="_blank" rel="noreferrer">
              Source ↗
            </a>
          )}
          {project.links.website && (
            <a href={project.links.website} target="_blank" rel="noreferrer">
              Live site ↗
            </a>
          )}
        </nav>
      )}
    </main>
  );
}
