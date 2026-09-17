import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BlogEditorWorkspace } from "./BlogEditorWorkspace";

const meta = {
  title: "Patterns/BlogEditorWorkspace",
  component: BlogEditorWorkspace,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BlogEditorWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Split: Story = {
  args: {
    mode: "split",
    editor: <textarea aria-label="本文" defaultValue="本文" />,
    preview: <div aria-label="プレビュー">プレビュー</div>,
  },
};
