/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import "./MediaGallery.css";

export interface MediaGalleryProps {
  images?: string[];
  gridClassName?: string;
  buttonClassName?: string;
}

export function MediaGallery({
  images = [],
  gridClassName,
  buttonClassName,
}: MediaGalleryProps) {
  const [large, setLarge] = React.useState<string | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const lightboxRef = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    if (!large) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        !(event.target instanceof Node) ||
        !lightboxRef.current?.contains(event.target)
      ) {
        return;
      }
      // A parent Radix layer can retain its document-capture listener until
      // passive effects run. Consume the lightbox's Escape before that listener.
      event.preventDefault();
      event.stopPropagation();
      setLarge(null);
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [large]);

  if (!images.length) return null;
  return (
    <>
      <div data-ds="media-gallery" className={gridClassName}>
        {images.map((src, index) => (
          <button
            type="button"
            className={buttonClassName}
            key={src}
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              setLarge(src);
            }}
            aria-label={`画像${index + 1}を拡大`}
          >
            <img src={src} alt={`添付画像 ${index + 1}`} />
          </button>
        ))}
      </div>
      <Dialog open={!!large} onOpenChange={(open) => !open && setLarge(null)}>
        <DialogContent
          ref={lightboxRef}
          data-ds="media-gallery-lightbox"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
        >
          <DialogTitle>添付画像</DialogTitle>
          {large && <img src={large} alt="拡大した添付画像" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
