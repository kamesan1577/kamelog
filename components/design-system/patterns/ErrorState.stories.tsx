import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ErrorState } from "./ErrorState";

const meta = {
  title: "Patterns/ErrorState",
  component: ErrorState,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {
  args: { onRetry: () => undefined },
};

export const Inline: Story = {
  args: {
    compact: true,
    title: "投稿を取得できませんでした",
    description: "通信を確認して、もう一度お試しください。",
    onRetry: () => undefined,
  },
};
