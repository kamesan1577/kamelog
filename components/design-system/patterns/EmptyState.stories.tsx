import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EmptyState } from "./EmptyState";

const meta = {
  title: "Patterns/EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    message: "該当する投稿はありません。",
    action: <button type="button">条件を解除</button>,
  },
};
