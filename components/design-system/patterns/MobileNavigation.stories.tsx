import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Home, MessageCircle, PanelsTopLeft } from "lucide-react";
import { MobileNavigation } from "./MobileNavigation";

const meta = {
  title: "Patterns/MobileNavigation",
  component: MobileNavigation,
  args: {
    items: [
      { id: "home", label: "ホーム", icon: <Home />, active: true },
      { id: "timeline", label: "タイムライン", icon: <MessageCircle /> },
      { id: "projects", label: "プロジェクト", icon: <PanelsTopLeft /> },
    ],
    className: "w-96 border border-ds-border bg-ds-surface",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof MobileNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeEqualSlots: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole("button");
    await expect(buttons).toHaveLength(3);
    await expect(buttons[0]).toHaveAttribute("aria-current", "page");
  },
};
