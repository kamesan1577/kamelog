import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
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
    className: "w-52",
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
    <div data-ds="public-sidebar">
      <span data-ds="site-name">kamelog</span>
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
    className: "",
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
    await expect(
      canvas.getByRole("navigation", { name: "メインナビゲーション" }),
    ).toBeVisible();
    const homeBox = home.getBoundingClientRect();
    const timelineBox = timeline.getBoundingClientRect();
    await expect(homeBox.height).toBeGreaterThanOrEqual(44);
    await expect(Math.abs(homeBox.x - timelineBox.x)).toBeLessThanOrEqual(1);
    await expect(homeBox.bottom).toBeLessThanOrEqual(timelineBox.top);

    await expect(home).toHaveAttribute("aria-current", "page");
    await expect(home).toHaveStyle({
      backgroundColor: "rgb(232, 238, 229)",
      color: "rgb(40, 85, 66)",
    });
    await userEvent.click(timeline);
    await expect(timeline).toHaveAttribute("aria-current", "page");
    await expect(home).not.toHaveAttribute("aria-current");
    await userEvent.unhover(timeline);
    await waitFor(() =>
      expect(home).not.toHaveStyle({ backgroundColor: "rgb(232, 238, 229)" }),
    );
    await waitFor(() =>
      expect(timeline).toHaveStyle({
        backgroundColor: "rgb(232, 238, 229)",
        color: "rgb(40, 85, 66)",
      }),
    );
    // Storybook userEvent dispatches DOM events, not a native CSS :hover.
    // The real pointer hover color is covered by quiet-publication.spec.ts.
    await userEvent.hover(timeline);
    await expect(timeline).toHaveAttribute("aria-current", "page");
    await expect(timeline).toHaveStyle({ color: "rgb(40, 85, 66)" });
    await waitFor(() =>
      expect(timeline).toHaveStyle({
        backgroundColor: "rgb(232, 238, 229)",
      }),
    );
  },
};
