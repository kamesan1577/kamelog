import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Button } from "../primitives/Button";
import { AppShell } from "./AppShell";

const navigation = (
  <div className="flex flex-col gap-ds-4 px-ds-4 py-ds-6">
    <p className="ds-text-sm font-medium">kamelog</p>
    <Button variant="ghost" size="sm">
      ホーム
    </Button>
    <Button variant="ghost" size="sm">
      タイムライン
    </Button>
  </div>
);

const meta = {
  title: "Layout/AppShell",
  component: AppShell,
  args: {
    sidebar: navigation,
    header: <div className="px-ds-4 py-ds-6 ds-text-sm">タイムライン</div>,
    children: (
      <div className="mx-auto max-w-ds-page px-ds-4 py-ds-6">
        <h1 className="ds-text-lg font-semibold">コンテンツ</h1>
      </div>
    ),
    mobileNavigation: (
      <div className="grid grid-cols-3 gap-ds-4 px-ds-4 py-ds-6">
        <Button variant="ghost" size="sm">
          ホーム
        </Button>
        <Button variant="ghost" size="sm">
          タイムライン
        </Button>
        <Button variant="ghost" size="sm">
          プロジェクト
        </Button>
      </div>
    ),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("main")).toBeVisible();
    await expect(
      canvas.getByRole("complementary", { name: "サイドナビゲーション" }),
    ).toBeVisible();
  },
};
