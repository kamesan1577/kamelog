import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ProjectList } from "./ProjectList";

const meta = {
  title: "Patterns/ProjectList",
  component: ProjectList,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ProjectList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      {
        slug: "kamelog",
        title: "kamelog",
        summary: "個人制作の記録を公開するWebサービス",
        stack: ["Next.js", "SQLite"],
        thumbnail: "/favicon.svg",
        source: "https://github.com/kamesan1577/kamelog",
      },
    ],
  },
};
