import * as React from "react";
import { cn } from "@/lib/utils";
import "./PostPreview.css";

export interface PostPreviewProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  title?: string;
  excerpt: string;
  excerptClassName?: string;
}

export function PostPreview({
  className,
  title,
  excerpt,
  excerptClassName,
  ...props
}: PostPreviewProps) {
  return (
    <button data-ds="post-preview" className={cn(className)} {...props}>
      {title ? (
        <>
          <h2>{title}</h2>
          <p
            data-ds={
              excerptClassName === "tweet-body" ? "tweet-body" : undefined
            }
            className={excerptClassName}
          >
            {excerpt}
          </p>
        </>
      ) : (
        <p
          data-ds={excerptClassName === "tweet-body" ? "tweet-body" : undefined}
          className={excerptClassName}
        >
          {excerpt}
        </p>
      )}
    </button>
  );
}
