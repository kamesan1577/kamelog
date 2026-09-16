import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PostCard } from "./PostCard";

const meta = {
  title: "Patterns/PostCard",
  component: PostCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PostCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    kind: "blog",
    children: <p>投稿本文</p>,
    className: "border-b py-4",
  },
};
