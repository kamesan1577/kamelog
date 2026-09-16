import * as React from "react";
export interface TagListProps extends React.HTMLAttributes<HTMLDivElement> {
  tags: string[];
  automaticTags?: string[];
  onTagSelect?: (tag: string) => void;
  renderTag: (tag: string, automatic: boolean) => React.ReactNode;
}

export function TagList({
  className,
  tags,
  automaticTags = [],
  onTagSelect,
  renderTag,
  ...props
}: TagListProps) {
  return (
    <div data-ds="tag-list" className={className} {...props}>
      {tags.map((tag) => {
        const automatic = automaticTags.includes(tag);
        const content = renderTag(tag, automatic);
        return onTagSelect ? (
          <button key={tag} type="button" onClick={() => onTagSelect(tag)}>
            {content}
          </button>
        ) : (
          <React.Fragment key={tag}>{content}</React.Fragment>
        );
      })}
    </div>
  );
}
