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
    const button = within(canvasElement).getByRole("button");
    await expect(button).toBeVisible();
    // Visibility alone accepts white text on a transparent surface.
    const style = getComputedStyle(button);
    await expect(style.backgroundColor).toBe("rgb(40, 85, 66)");
    await expect(style.color).toBe("rgb(255, 255, 255)");
  },
};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Danger: Story = { args: { variant: "danger" } };
export const Disabled: Story = { args: { disabled: true } };
