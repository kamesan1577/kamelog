import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Image as ImageIcon } from "lucide-react";
import { MediaUploadField } from "./MediaUploadField";

const meta = {
  title: "Patterns/MediaUploadField",
  component: MediaUploadField,
  parameters: { layout: "padded" },
} satisfies Meta<typeof MediaUploadField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: <ImageIcon />,
    label: "画像を追加",
    accept: "image/png,image/jpeg,image/webp,image/gif",
    onFilesSelected: () => undefined,
  },
};
