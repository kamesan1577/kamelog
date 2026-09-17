import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { XShareIcon } from "./XShareIcon";

const meta = {
  title: "Primitives/XShareIcon",
  component: XShareIcon,
  parameters: { layout: "centered" },
} satisfies Meta<typeof XShareIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
