import * as React from "react";
import { cn } from "@/lib/utils";
import "./PostCard.css";

export type PostCardKind = "blog" | "tweet" | "vlog";

export interface PostCardProps extends React.HTMLAttributes<HTMLElement> {
  kind: PostCardKind;
  pinned?: boolean;
  pinnedLabel?: React.ReactNode;
  pinnedClassName?: string;
}

export function PostCard({
  className,
  kind,
  pinned = false,
  pinnedLabel,
  pinnedClassName,
  children,
  ...props
}: PostCardProps) {
  return (
    <article
      data-ds="post-card"
      data-ds-kind={kind}
      className={className}
      {...props}
    >
      {pinned && <div className={cn(pinnedClassName)}>{pinnedLabel}</div>}
      {children}
    </article>
  );
}
