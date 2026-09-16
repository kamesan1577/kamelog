import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageShell } from "./PageShell";
const meta = {
  title: "Layout/PageShell",
  component: PageShell,
  args: { children: <h1>ページの基本シェル</h1> },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageShell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
