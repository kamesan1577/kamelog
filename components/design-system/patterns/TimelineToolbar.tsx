import * as React from "react";
import { Check, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TimelineFilter = "all" | "blog" | "tweet" | "vlog";
export type TimelineSort = "new" | "popular";

export interface TimelineToolbarProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
  filter: TimelineFilter;
  onFilterChange: (filter: TimelineFilter) => void;
  sort: TimelineSort;
  onSortChange: (sort: TimelineSort) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function TimelineToolbar({
  className,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  onRefresh,
  refreshing = false,
  ...props
}: TimelineToolbarProps) {
  return (
    <div
      data-ds="timeline-toolbar"
      className={cn("flex", className)}
      {...props}
    >
      <Tabs
        value={filter}
        onValueChange={(value) => onFilterChange(value as TimelineFilter)}
      >
        <TabsList variant="line" data-ds="timeline-tabs">
          <TabsTrigger value="all">すべて</TabsTrigger>
          <TabsTrigger value="blog">ブログ</TabsTrigger>
          <TabsTrigger value="tweet">つぶやき</TabsTrigger>
          <TabsTrigger value="vlog">vlog</TabsTrigger>
        </TabsList>
      </Tabs>
      <div data-ds="timeline-toolbar-actions">
        {onRefresh && (
          <button
            type="button"
            aria-label="タイムラインを更新"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw size={17} className={refreshing ? "animate-spin" : undefined} />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="並び替え">
              <SlidersHorizontal size={17} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSortChange("new")}>
              新しい順 {sort === "new" && <Check />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSortChange("popular")}>
              いいね順 {sort === "popular" && <Check />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
