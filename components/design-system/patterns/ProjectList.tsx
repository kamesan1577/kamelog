import * as React from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProjectListItem {
  slug: string;
  title: string;
  summary: string;
  stack: string[];
  thumbnail: string;
  source?: string;
}

export interface ProjectListProps extends React.HTMLAttributes<HTMLDivElement> {
  items: ProjectListItem[];
  tileClassName?: string;
  staticTileClassName?: string;
}

export function ProjectList({
  className,
  items,
  tileClassName,
  staticTileClassName,
  ...props
}: ProjectListProps) {
  return (
    <div data-ds="project-list" className={cn("grid", className)} {...props}>
      {items.map((project) => {
        const content = (
          <>
            <Image src={project.thumbnail} alt="" width={640} height={360} />
            <div>
              <h2>
                {project.title} {project.source && <ArrowUpRight size={16} />}
              </h2>
              <p>{project.summary}</p>
              <span>{project.stack.join(" · ")}</span>
            </div>
          </>
        );

        return project.source ? (
          <a
            className={tileClassName}
            key={project.slug}
            href={project.source}
            target="_blank"
            rel="noreferrer"
          >
            {content}
          </a>
        ) : (
          <div className={staticTileClassName} key={project.slug}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
