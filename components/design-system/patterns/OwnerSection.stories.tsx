import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { OwnerSection } from "./OwnerSection";

const meta = {
  title: "Patterns/OwnerSection",
  component: OwnerSection,
  parameters: { layout: "padded" },
} satisfies Meta<typeof OwnerSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "プロフィール",
    description: "公開プロフィールを管理します。",
    children: <button type="button">保存</button>,
  },
};
