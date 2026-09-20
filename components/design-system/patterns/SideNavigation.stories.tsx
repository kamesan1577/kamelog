import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Globe, Home, MessageCircle, Settings } from "lucide-react";
import { SideNavigation, type SideNavigationProps } from "./SideNavigation";
import "./PublicNavigation.css";

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

function InteractiveSidebar(args: SideNavigationProps) {
  const [activeId, setActiveId] = useState("home");
  return (
    <div
      data-ds="public-sidebar"
      style={{ minHeight: "auto", position: "static" }}
    >
      <SideNavigation
        {...args}
        items={args.items.map((item) => ({
          ...item,
          active: item.id === activeId,
        }))}
        onSelect={setActiveId}
      />
    </div>
  );
}

export const FilledSelection: Story = {
  args: {
    items: [
      { id: "home", label: "ホーム", icon: <Home /> },
      { id: "timeline", label: "タイムライン", icon: <MessageCircle /> },
      { id: "projects", label: "プロジェクト", icon: <Globe /> },
    ],
  },
  render: (args) => <InteractiveSidebar {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const home = canvas.getByRole("button", { name: "ホーム" });
    const timeline = canvas.getByRole("button", { name: "タイムライン" });

    await expect(home).toHaveAttribute("aria-current", "page");
    await expect(home).toHaveStyle({
      backgroundColor: "rgb(55, 53, 47)",
      color: "rgb(255, 255, 255)",
    });
    await userEvent.click(timeline);
    await expect(timeline).toHaveAttribute("aria-current", "page");
    await expect(home).not.toHaveAttribute("aria-current");
    await userEvent.unhover(timeline);
    await expect(home).not.toHaveStyle({ backgroundColor: "rgb(55, 53, 47)" });
    await expect(timeline).toHaveStyle({
      backgroundColor: "rgb(55, 53, 47)",
      color: "rgb(255, 255, 255)",
    });
    await userEvent.hover(timeline);
    await expect(timeline).toHaveStyle({
      backgroundColor: "rgb(41, 40, 36)",
      color: "rgb(255, 255, 255)",
    });
  },
};
