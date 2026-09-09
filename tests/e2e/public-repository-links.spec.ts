import { test, expect } from "@playwright/test";

test("public site exposes source code and issue-report links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const footer = page.getByRole("contentinfo", {
    name: "kamelogの開発情報",
  });
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();
  await expect(
    footer.getByRole("link", { name: "ソースコード" }),
  ).toHaveAttribute("href", "https://github.com/kamesan1577/kamelog");
  await expect(
    footer.getByRole("link", { name: "不具合・要望をIssueで報告" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/kamesan1577/kamelog/issues/new",
  );
});
