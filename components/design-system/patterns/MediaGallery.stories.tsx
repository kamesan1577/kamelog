import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MediaGallery } from "./MediaGallery";

const meta = {
  title: "Patterns/MediaGallery",
  component: MediaGallery,
  parameters: { layout: "padded" },
} satisfies Meta<typeof MediaGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    images: ["/projects/kamelog.svg", "/projects/home-lab.svg"],
    gridClassName: "grid grid-cols-2 gap-2",
  },
};
