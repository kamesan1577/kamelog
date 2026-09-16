import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./Badge";
const meta = {
  title: "Primitives/Badge",
  component: Badge,
  args: { children: "ブログ" },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const LongContent: Story = { args: { children: "設計システムのタグ" } };
