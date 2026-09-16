import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PostPreview } from "./PostPreview";

const meta = {
  title: "Patterns/PostPreview",
  component: PostPreview,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PostPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Blog: Story = {
  args: {
    title: "記事のタイトル",
    excerpt: "記事の概要がここに入ります。",
    className: "w-full text-left",
  },
};
