import * as React from "react";
import { PostCard } from "./PostCard";

export type TimelineItemProps = React.ComponentProps<typeof PostCard>;

export function TimelineItem(props: TimelineItemProps) {
  return <PostCard {...props} />;
}
