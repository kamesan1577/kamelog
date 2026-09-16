import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InlineComposer } from "./InlineComposer";

const meta = {
  title: "Patterns/InlineComposer",
  component: InlineComposer,
  parameters: { layout: "padded" },
} satisfies Meta<typeof InlineComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    avatar: <span aria-hidden="true">🐢</span>,
    value: "",
    onValueChange: () => undefined,
    onSubmit: () => undefined,
    submit: <button type="button">投稿</button>,
    toolbar: <div>画像 · ブログ · vlog</div>,
  },
};
