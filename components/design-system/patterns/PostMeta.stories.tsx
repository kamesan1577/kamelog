import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PostMeta } from "./PostMeta";

const meta = {
  title: "Patterns/PostMeta",
  component: PostMeta,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PostMeta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Blog: Story = {
  args: {
    avatar: <span aria-hidden="true">🐢</span>,
    author: "かめさん",
    kind: "blog",
    date: "2026-09-17T09:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z",
    kindLabel: "ブログ",
  },
};
