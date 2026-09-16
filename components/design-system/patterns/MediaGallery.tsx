/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

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
  if (!images.length) return null;
  return (
    <>
      <div data-ds="media-gallery" className={gridClassName}>
        {images.map((src, index) => (
          <button
            type="button"
            className={buttonClassName}
            key={src}
            onClick={() => setLarge(src)}
            aria-label={`画像${index + 1}を拡大`}
          >
            <img src={src} alt={`添付画像 ${index + 1}`} />
          </button>
        ))}
      </div>
      <Dialog open={!!large} onOpenChange={(open) => !open && setLarge(null)}>
        <DialogContent data-ds="media-gallery-lightbox">
          <DialogTitle>添付画像</DialogTitle>
          {large && <img src={large} alt="拡大した添付画像" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
