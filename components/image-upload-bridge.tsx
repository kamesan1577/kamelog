"use client";

import { useEffect } from "react";

const MAX_IMAGE_EDGE = 2560;
const WEBP_QUALITY = 0.88;
const IMAGE_INPUT_SELECTOR = '.image-upload-button input[type="file"]';
const COMPOSER_TEXTAREA_SELECTOR =
  ".desktop-composer textarea, textarea.body-input.blog, textarea.body-input.tweet";

type Drawable = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

async function decodeImage(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image decode failed"));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function webpName(name: string) {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.webp`;
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height) return file;
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
    );
    if (!blob || blob.type !== "image/webp") return file;
    if (scale === 1 && blob.size >= file.size) return file;
    return new File([blob], webpName(file.name), {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } finally {
    decoded.dispose();
  }
}

async function prepareImages(files: File[]) {
  return Promise.all(
    files.map(async (file) => {
      try {
        return await compressImage(file);
      } catch {
        return file;
      }
    }),
  );
}

function imageFiles(files: FileList | null | undefined) {
  return Array.from(files || []).filter((file) => file.type.startsWith("image/"));
}

function clipboardImages(data: DataTransfer | null) {
  if (!data) return [];
  const fromItems = Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
  return fromItems.length ? fromItems : imageFiles(data.files);
}

function transferFor(files: File[]) {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer;
}

export function ImageUploadBridge() {
  useEffect(() => {
    const forwarded = new WeakSet<Event>();

    const forwardDrop = async (target: HTMLTextAreaElement, files: File[]) => {
      const prepared = await prepareImages(files);
      const next = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transferFor(prepared),
      });
      forwarded.add(next);
      target.dispatchEvent(next);
    };

    const onPaste = (event: ClipboardEvent) => {
      if (forwarded.has(event)) return;
      const target = event.target;
      if (
        !(target instanceof HTMLTextAreaElement) ||
        !target.matches(COMPOSER_TEXTAREA_SELECTOR)
      )
        return;
      const files = clipboardImages(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void forwardDrop(target, files);
    };

    const onDrop = (event: DragEvent) => {
      if (forwarded.has(event)) return;
      const target = event.target;
      if (
        !(target instanceof HTMLTextAreaElement) ||
        !target.matches(COMPOSER_TEXTAREA_SELECTOR)
      )
        return;
      const files = imageFiles(event.dataTransfer?.files);
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void forwardDrop(target, files);
    };

    const onChange = (event: Event) => {
      if (forwarded.has(event)) return;
      const input = event.target;
      if (
        !(input instanceof HTMLInputElement) ||
        !input.matches(IMAGE_INPUT_SELECTOR) ||
        !input.files?.length
      )
        return;
      const files = Array.from(input.files);
      if (!files.some((file) => file.type.startsWith("image/"))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void prepareImages(files).then((prepared) => {
        input.files = transferFor(prepared).files;
        const next = new Event("change", { bubbles: true });
        forwarded.add(next);
        input.dispatchEvent(next);
      });
    };

    document.addEventListener("paste", onPaste, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("change", onChange, true);
    return () => {
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("change", onChange, true);
    };
  }, []);

  return null;
}
