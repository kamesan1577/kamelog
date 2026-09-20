import * as React from "react";
import { cn } from "@/lib/utils";

export type PostMetaKind = "blog" | "tweet" | "vlog";

export interface PostMetaProps extends React.HTMLAttributes<HTMLDivElement> {
  avatar: React.ReactNode;
  author: string;
  kind: PostMetaKind;
  date: string;
  updatedAt?: string;
  kindLabel: string;
  kindLabelClassName?: string;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PostMeta({
  className,
  avatar,
  author,
  kind,
  date,
  updatedAt,
  kindLabel,
  kindLabelClassName,
  ...props
}: PostMetaProps) {
  return (
    <div data-ds="post-meta" className={className} {...props}>
      {avatar}
      <b>{author}</b>
      <span aria-hidden="true">·</span>
      <time dateTime={date}>{formatDate(date)}</time>
      {kind === "blog" && updatedAt && (
        <>
          <span aria-hidden="true">·</span>
          <time dateTime={updatedAt} title="最終更新日">
            更新 {formatDate(updatedAt)}
          </time>
        </>
      )}
      <span data-ds-kind={kind} className={cn(kindLabelClassName)}>
        {kindLabel}
      </span>
    </div>
  );
}
