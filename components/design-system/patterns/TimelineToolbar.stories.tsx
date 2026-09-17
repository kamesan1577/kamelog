import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TimelineToolbar } from "./TimelineToolbar";

const meta = {
  title: "Patterns/TimelineToolbar",
  component: TimelineToolbar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TimelineToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    filter: "all",
    onFilterChange: () => undefined,
    sort: "new",
    onSortChange: () => undefined,
  },
};
