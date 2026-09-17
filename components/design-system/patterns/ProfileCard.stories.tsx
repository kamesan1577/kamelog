import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ProfileCard } from "./ProfileCard";

const meta = {
  title: "Patterns/ProfileCard",
  component: ProfileCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ProfileCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    avatar: <span aria-hidden="true">🐢</span>,
    name: "かめさん",
    handle: "@kamesan1577",
    bio: "Backend Engineerとして設計と実装をしています。",
    link: <a href="https://github.com">GitHub</a>,
  },
};
