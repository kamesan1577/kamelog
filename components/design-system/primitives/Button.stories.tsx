import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { expect, within } from "storybook/test";

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: { children: "保存" },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Primary: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toBeVisible();
  },
};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Danger: Story = { args: { variant: "danger" } };
export const Disabled: Story = { args: { disabled: true } };
