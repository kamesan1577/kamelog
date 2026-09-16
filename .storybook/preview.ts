import type { Preview } from "@storybook/react-vite";
import "../styles/tokens.css";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    actions: { argTypesRegex: "^(on|handle)[A-Z].*" },
  },
};

export default preview;
