import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Home, MessageCircle, Settings } from "lucide-react";
import { SideNavigation } from "./SideNavigation";

const meta = {
  title: "Patterns/SideNavigation",
  component: SideNavigation,
  args: {
    items: [
      { id: "home", label: "ホーム", icon: <Home />, active: true },
      {
        id: "timeline",
        label: "タイムライン",
        icon: <MessageCircle />,
        count: 12,
      },
      { id: "account", label: "アカウント", icon: <Settings /> },
    ],
    className: "w-52 px-ds-4 py-ds-6",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof SideNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const home = canvas.getByRole("button", { name: "ホーム" });
    await expect(home).toHaveAttribute("aria-current", "page");
    await userEvent.click(canvas.getByRole("button", { name: /タイムライン/ }));
  },
};

export const OwnerNavigation: Story = {
  args: {
    items: [
      { id: "home", label: "ホーム", icon: <Home /> },
      { id: "account", label: "アカウント", icon: <Settings />, active: true },
    ],
  },
};
