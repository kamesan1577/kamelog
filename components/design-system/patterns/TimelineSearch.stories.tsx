import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { TimelineSearch, type TimelineSearchProps } from "./TimelineSearch";

const fixtureTags = [
  { name: "開発", count: 3 },
  { name: "読書", count: 2 },
  { name: "日記", count: 1 },
];

const meta = {
  title: "Patterns/TimelineSearch",
  component: TimelineSearch,
  parameters: { layout: "padded" },
  args: {
    id: "timeline-search-story",
    open: true,
    query: "",
    onQueryChange: fn(),
    tag: "",
    tags: fixtureTags,
    onTagChange: fn(),
    hasMoreTags: false,
    onMoreTags: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof TimelineSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

function InteractiveSearch(args: TimelineSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(args.query);
  const [tag, setTag] = useState(args.tag);
  const [expanded, setExpanded] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    toggle.current?.focus();
  }

  return (
    <div className="max-w-xl space-y-4">
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={args.id}
        onClick={() => (open ? close() : setOpen(true))}
      >
        検索とタグ
      </button>
      <TimelineSearch
        {...args}
        open={open}
        query={query}
        onQueryChange={setQuery}
        tag={tag}
        tags={expanded ? [...args.tags, { name: "写真", count: 1 }] : args.tags}
        onTagChange={setTag}
        hasMoreTags={!expanded}
        onMoreTags={() => setExpanded(true)}
        onClose={close}
      />
    </div>
  );
}

export const Interactive: Story = {
  render: (args) => <InteractiveSearch {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: "検索とタグ" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("search")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    const input = canvas.getByRole("textbox", { name: "投稿を検索" });
    await waitFor(() => expect(input).toHaveFocus());
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.type(input, "設計");
    await expect(input).toHaveValue("設計");

    const development = canvas.getByRole("button", { name: /#開発/ });
    await userEvent.click(development);
    await expect(development).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "もっと見る" }));
    await expect(canvas.getByRole("button", { name: /#写真/ })).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "もっと見る" }),
    ).not.toBeInTheDocument();

    await userEvent.click(input);
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("search")).not.toBeInTheDocument();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveFocus();

    await userEvent.click(toggle);
    await waitFor(() => expect(input).toHaveFocus());
    await expect(input).toHaveValue("設計");
    await expect(development).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("button", { name: /#写真/ })).toBeVisible();
    await userEvent.click(development);
    await expect(development).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(canvas.getByRole("button", { name: "検索語を消去" }));
    await expect(input).toHaveValue("");
  },
};
