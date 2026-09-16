import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NotFoundState } from "./NotFoundState";

const meta = {
  title: "Patterns/NotFoundState",
  component: NotFoundState,
  parameters: { layout: "padded" },
} satisfies Meta<typeof NotFoundState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
