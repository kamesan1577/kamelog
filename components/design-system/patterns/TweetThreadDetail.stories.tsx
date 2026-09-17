import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TweetThreadDetail, { type ThreadPost } from "@/app/tweet-thread-detail";

const posts: ThreadPost[] = [
  {
    id: "story-root",
    kind: "tweet",
    title: "",
    body: "スレッドのルート投稿",
    date: "2026-09-17T09:00:00.000Z",
    federationEnabled: true,
  },
  {
    id: "story-child",
    kind: "tweet",
    title: "",
    body: "スレッドの返信",
    date: "2026-09-17T09:05:00.000Z",
    parentId: "story-root",
    federationEnabled: true,
  },
];

const meta = {
  title: "Patterns/TweetThreadDetail",
  component: TweetThreadDetail,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TweetThreadDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerDetail: Story = {
  args: {
    posts,
    selectedId: "story-child",
    authenticated: true,
    federationAvailable: true,
    onOpenPost: () => undefined,
    onPostCreated: () => undefined,
  },
};

export const PublicDetail: Story = {
  args: {
    posts,
    selectedId: "story-child",
    authenticated: false,
    federationAvailable: false,
    onOpenPost: () => undefined,
    onPostCreated: () => undefined,
  },
};
