import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FileText, MessageCircle, Video } from "lucide-react";
import { ContentIndex } from "./ContentIndex";

const meta = {
  title: "Patterns/ContentIndex",
  component: ContentIndex,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ContentIndex>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      {
        id: "blog",
        title: "ブログ",
        description: "技術記事",
        icon: <FileText />,
        count: 4,
      },
      {
        id: "tweet",
        title: "つぶやき",
        description: "短いメモ",
        icon: <MessageCircle />,
        count: 12,
      },
      {
        id: "vlog",
        title: "vlog",
        description: "短い動画",
        icon: <Video />,
        count: 2,
      },
    ],
    onSelect: () => undefined,
  },
};
