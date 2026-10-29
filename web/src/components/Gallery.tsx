import { useRef, useState } from "react";
import type { Art } from "../types";
import { ArtImage } from "./ArtImage";
import { Modal } from "./Modal";
export function Gallery({ images, name }: { images: Art[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  return (
    <div className="gallery">
      <div
        className="gallery-track"
        onScroll={(e) => {
          if (matchMedia("(max-width: 899px)").matches) {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }
        }}
      >
        {images.map((art, i) => (
          <button
            key={art.base}
            className="gallery-image"
            aria-label={`View image ${i + 1} of ${name}`}
            onClick={() => setViewer(i)}
          >
            <ArtImage art={art} priority={i === 0} sizes="(min-width: 900px) 58vw, calc(100vw - 32px)" />
            <span className="gallery-zoom label">EXPLORE IMAGE +</span>
          </button>
        ))}
      </div>
      <div className="gallery-counter label">
        <span>
          {index + 1} / {images.length}
        </span>
        <span>SWIPE TO EXPLORE</span>
      </div>
      {viewer !== null && <ImageViewer images={images} initial={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
function ImageViewer({ images, initial, onClose }: { images: Art[]; initial: number; onClose: () => void }) {
  const [index, setIndex] = useState(initial);
  const [zoom, setZoom] = useState(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const distance = () => {
    const p = [...pointers.current.values()];
    return p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  };
  return (
    <Modal label="Artwork image viewer" onClose={onClose} className="viewer-dialog">
      <div className="viewer-header">
        <p className="label">
          THE ART · {index + 1} / {images.length}
        </p>
        <button className="text-button" onClick={onClose}>
          CLOSE
        </button>
      </div>
      <div
        className="viewer-canvas"
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) pinch.current = { distance: distance(), zoom };
        }}
        onPointerMove={(e) => {
          const previous = pointers.current.get(e.pointerId);
          if (!previous) return;
          if (pointers.current.size === 1 && zoom > 1) {
            e.currentTarget.scrollLeft -= e.clientX - previous.x;
            e.currentTarget.scrollTop -= e.clientY - previous.y;
          }
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2 && pinch.current)
            setZoom(Math.min(4, Math.max(1, (pinch.current.zoom * distance()) / pinch.current.distance)));
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
      >
        <div className="viewer-art" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
          <ArtImage art={images[index]} sizes={`${Math.round(zoom * 100)}vw`} priority />
        </div>
      </div>
      <div className="viewer-controls">
        <button
          className="text-button"
          disabled={index === 0}
          onClick={() => {
            setIndex(index - 1);
            setZoom(1);
          }}
        >
          PREVIOUS
        </button>
        <label>
          Zoom{" "}
          <input
            aria-label="Artwork zoom"
            type="range"
            min="1"
            max="4"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <button
          className="text-button"
          disabled={index === images.length - 1}
          onClick={() => {
            setIndex(index + 1);
            setZoom(1);
          }}
        >
          NEXT
        </button>
      </div>
    </Modal>
  );
}
