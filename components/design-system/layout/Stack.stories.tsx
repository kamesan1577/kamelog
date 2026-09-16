import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "./Stack";
const meta = {
  title: "Layout/Stack",
  component: Stack,
  args: {
    children: (
      <>
        <div>上の項目</div>
        <div>下の項目</div>
      </>
    ),
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Stack>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
