"use client";

import { useId } from "react";
import { useTheme } from "@/components/theme-provider";
import { themePreference } from "@/lib/theme";
import "./ThemeControl.css";

export function ThemeControl() {
  const id = useId();
  const { preference, setPreference, ready } = useTheme();

  return (
    <div data-ds="theme-control">
      <label htmlFor={id}>表示テーマ</label>
      <select
        id={id}
        value={preference}
        disabled={!ready}
        onChange={(event) =>
          setPreference(themePreference(event.currentTarget.value))
        }
      >
        <option value="system">システム</option>
        <option value="light">ライト</option>
        <option value="dark">ダーク</option>
      </select>
    </div>
  );
}
