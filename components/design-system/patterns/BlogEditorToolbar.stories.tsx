import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BlogEditorToolbar } from "./BlogEditorToolbar";

const meta = {
  title: "Patterns/BlogEditorToolbar",
  component: BlogEditorToolbar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BlogEditorToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    role: "toolbar",
    "aria-label": "Markdown記法",
    children: <button type="button">見出し</button>,
  },
};
