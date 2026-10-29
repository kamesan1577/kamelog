import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import { PostReader, type PostReaderProps } from "./PostReader";
import { MediaGallery } from "./MediaGallery";

function ReaderExample(args: PostReaderProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        投稿を読む
      </button>
      {open && (
        <PostReader
          {...args}
          onClose={() => {
            args.onClose();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

const meta = {
  title: "Patterns/PostReader",
  component: PostReader,
  render: (args) => <ReaderExample {...args} />,
  args: {
    postId: "reader-example",
    title: "投稿の閲覧画面",
    kind: "blog",
    onClose: fn(),
    children: (
      <article>
        <h1>投稿の閲覧画面</h1>
        <p>投稿の本文、写真、目次、リンクをこの画面で表示します。</p>
        <a href="#reader-example-end">本文内のリンク</a>
        <p id="reader-example-end">
          短い投稿は、最初から読書進捗が100%になります。
        </p>
      </article>
    ),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PostReader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Blog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const opener = canvas.getByRole("button", { name: "投稿を読む" });
    await userEvent.click(opener);
    const close = await page.findByRole("button", { name: "投稿を閉じる" });
    await expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(
      page.getByRole("link", { name: "本文内のリンク" }),
    ).toHaveFocus();
    await userEvent.tab();
    await expect(close).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(page.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await expect(opener).toHaveFocus();
    await userEvent.click(opener);
    await waitFor(() =>
      expect(
        page.getByRole("progressbar", { name: "読書進捗" }),
      ).toHaveAttribute("aria-valuenow", "100"),
    );
  },
};

export const Tweet: Story = {
  args: {
    kind: "tweet",
    title: "ツイート",
    children: (
      <article>
        <p>短い投稿も、記事と同じ閲覧画面で読めます。</p>
        <button type="button">返信</button>
      </article>
    ),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "投稿を読む" }),
    );
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole("dialog", { name: "ツイート" }),
    ).toBeVisible();
  },
};

export const LongArticle: Story = {
  args: {
    title: "長い記事の読書進捗",
    actions: <button type="button">リンクをコピー</button>,
    children: (
      <article>
        <h1>長い記事の読書進捗</h1>
        {Array.from({ length: 40 }, (_, index) => (
          <section key={index}>
            <h2>見出し {index + 1}</h2>
            <p>
              記事の本文が長い場合は、本文の領域だけがスクロールします。ヘッダー、共有の操作、読書進捗は同じ位置に残ります。
            </p>
          </section>
        ))}
      </article>
    ),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "投稿を読む" }),
    );
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", {
      name: "長い記事の読書進捗",
    });
    const progress = page.getByRole("progressbar", { name: "読書進捗" });
    const scroll = dialog.querySelector<HTMLElement>(
      '[data-ds="reader-scroll"]',
    );
    if (!scroll) throw new Error("Reader scroll container is missing");
    await waitFor(() => expect(progress).toHaveAttribute("aria-valuenow", "0"));
    scroll.scrollTop = scroll.scrollHeight;
    fireEvent.scroll(scroll);
    await waitFor(() =>
      expect(progress).toHaveAttribute("aria-valuenow", "100"),
    );
    await expect(
      page.getByRole("button", { name: "リンクをコピー" }),
    ).toBeVisible();
    scroll.scrollTop = 0;
    fireEvent.scroll(scroll);
    await waitFor(() => expect(progress).toHaveAttribute("aria-valuenow", "0"));
  },
};

export const NestedImage: Story = {
  args: {
    title: "画像付きの投稿",
    kind: "tweet",
    onClose: fn(),
    children: <MediaGallery images={["/github-mark.svg"]} />,
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "投稿を読む" }),
    );
    const page = within(canvasElement.ownerDocument.body);
    const reader = await page.findByRole("dialog", { name: "画像付きの投稿" });
    const imageTrigger = within(reader).getByRole("button", {
      name: "画像1を拡大",
    });
    for (let index = 0; index < 3; index += 1) {
      await userEvent.click(imageTrigger);
      const lightbox = await page.findByRole("dialog", { name: "添付画像" });
      await waitFor(() =>
        expect(
          within(lightbox).getByRole("button", { name: "Close" }),
        ).toHaveFocus(),
      );
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(lightbox).not.toBeInTheDocument());
      await expect(reader).toBeVisible();
      await waitFor(() => expect(imageTrigger).toHaveFocus());
    }
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};
