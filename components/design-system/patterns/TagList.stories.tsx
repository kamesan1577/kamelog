import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TagList } from "./TagList";

const meta = {
  title: "Patterns/TagList",
  component: TagList,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TagList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tags: ["TypeScript", "自動分類"],
    automaticTags: ["自動分類"],
    className: "flex gap-2",
    renderTag: (tag, automatic) => (
      <span>
        {automatic ? "AI · " : ""}
        {tag}
      </span>
    ),
  },
};
