import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EditorFooter } from "./EditorFooter";

const meta = {
  title: "Patterns/EditorFooter",
  component: EditorFooter,
  parameters: { layout: "padded" },
} satisfies Meta<typeof EditorFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    characterCount: 42,
    closeAction: <button type="button">閉じる</button>,
    submitAction: <button type="button">投稿</button>,
  },
};
