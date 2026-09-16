import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TimelineItem } from "./TimelineItem";

const meta = {
  title: "Patterns/TimelineItem",
  component: TimelineItem,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TimelineItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    kind: "tweet",
    children: (
      <>
        <small>かめさん · 9月17日</small>
        <p>Design Systemに移行中です。</p>
        <button type="button">リンクをコピー</button>
      </>
    ),
  },
};
