import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ThemeHead } from "@/components/theme-head";
import { THEME_STORAGE_KEY, themePreference } from "@/lib/theme";
import { ErrorState } from "./ErrorState";
import { ThemeControl } from "./ThemeControl";

const meta = {
  title: "Patterns/ThemeControl",
  component: ThemeControl,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ThemeControl>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByRole("combobox", {
      name: "表示テーマ",
    });
    await expect(select).toBeEnabled();
    await expect(within(select).getAllByRole("option")).toHaveLength(3);
  },
};

function ErrorDocumentRecovery() {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <ThemeHead />
      {failed ? (
        <ErrorState />
      ) : (
        <section>
          <ThemeControl />
          <button
            type="button"
            onClick={() => {
              // GlobalError replaces the root with data-theme="system". React
              // does not execute its inline bootstrap on a client-side mount.
              document.documentElement.dataset.theme = "system";
              for (const meta of document.querySelectorAll<HTMLMetaElement>(
                "meta[data-theme-color]",
              )) {
                meta.media = `(prefers-color-scheme: ${meta.dataset.themeColor})`;
              }
              setFailed(true);
            }}
          >
            エラー画面を表示
          </button>
        </section>
      )}
    </>
  );
}

function verifyErrorRecovery(blockStorage: boolean): Story["play"] {
  return async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const previousPreference = themePreference(
      document.documentElement.dataset.theme,
    );
    const previousSaved = localStorage.getItem(THEME_STORAGE_KEY);
    const setItem = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      "setItem",
    );
    if (!setItem) throw new Error("Storage.setItem is unavailable");
    try {
      if (blockStorage) {
        Object.defineProperty(Storage.prototype, "setItem", {
          ...setItem,
          value() {
            throw new DOMException(
              "Fictional full storage",
              "QuotaExceededError",
            );
          },
        });
      }
      await userEvent.selectOptions(
        canvas.getByRole("combobox", { name: "表示テーマ" }),
        "dark",
      );
      await expect(document.documentElement).toHaveAttribute(
        "data-theme",
        "dark",
      );
      await expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(
        blockStorage ? previousSaved : "dark",
      );
      await userEvent.click(
        canvas.getByRole("button", { name: "エラー画面を表示" }),
      );
      await expect(canvas.getByRole("alert")).toBeVisible();
      const recovered = canvas.getByRole("combobox", { name: "表示テーマ" });
      await waitFor(async () => {
        await expect(recovered).toHaveValue("dark");
        await expect(document.documentElement).toHaveAttribute(
          "data-theme",
          "dark",
        );
        await expect(
          document.querySelector('meta[data-theme-color="dark"]'),
        ).toHaveAttribute("media", "all");
        await expect(
          document.querySelector('meta[data-theme-color="light"]'),
        ).toHaveAttribute("media", "not all");
      });
    } finally {
      Object.defineProperty(Storage.prototype, "setItem", setItem);
      await userEvent.selectOptions(
        canvas.getByRole("combobox", { name: "表示テーマ" }),
        previousPreference,
      );
      if (previousSaved === null) localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, previousSaved);
    }
  };
}

export const ErrorRecovery: Story = {
  render: () => <ErrorDocumentRecovery />,
  play: verifyErrorRecovery(false),
};

export const ErrorRecoveryWithoutStorage: Story = {
  render: () => <ErrorDocumentRecovery />,
  play: verifyErrorRecovery(true),
};
