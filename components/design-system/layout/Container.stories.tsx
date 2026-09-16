import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container } from "./Container";
const meta = {
  title: "Layout/Container",
  component: Container,
  args: { children: "ページ幅を揃えるコンテンツ" },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Container>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
