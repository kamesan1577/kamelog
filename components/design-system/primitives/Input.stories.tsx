import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./Input";
const meta = {
  title: "Primitives/Input",
  component: Input,
  args: { placeholder: "検索" },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Filled: Story = { args: { value: "kamelog", readOnly: true } };
export const Disabled: Story = { args: { disabled: true } };
