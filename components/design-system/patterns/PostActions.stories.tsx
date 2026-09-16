import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PostActions } from "./PostActions";

const meta = {
  title: "Patterns/PostActions",
  component: PostActions,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PostActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <button type="button">リンクをコピー</button>,
  },
};
