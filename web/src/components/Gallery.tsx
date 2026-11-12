import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Art, Box } from "../types";
import { ArtImage } from "./ArtImage";
import { Modal } from "./Modal";
import { SpinBox } from "./SpinBox";
import { GALLERY_BOX_SIZES, GALLERY_LEAD_SIZES } from "../gallerySizes";
export function Gallery({ images, name, box }: { images: Art[]; name: string; box?: Box | null }) {
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  if (images.length === 0) return null;
  // The box, when there is one, is the first slide; the photos follow it.
  const slides = images.length + (box ? 1 : 0);
  // A refreshed product can have fewer images than the remembered position.
  const current = Math.min(index, slides - 1);
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
        {box && (
          // A swipe here moves the gallery on a phone, so a finger turns the box with the button.
          <div className="gallery-image gallery-box"><SpinBox box={box} sizes={GALLERY_BOX_SIZES} priority controls touchDrag={false} /></div>
        )}
        {images.map((art, i) => (
          <button
            key={art.base}
            className="gallery-image"
            aria-label={`View image ${i + 1} of ${name}`}
            onClick={() => setViewer(i)}
          >
            <ArtImage art={art} priority={i === 0 && !box} sizes={i === 0 ? GALLERY_LEAD_SIZES : "(min-width: 900px) 28vw, calc(100vw - 32px)"} />
            <span className="gallery-zoom label">EXPLORE IMAGE <Plus aria-hidden="true" /></span>
          </button>
        ))}
      </div>
      <div className="gallery-counter label">
        <span>
          {current + 1} / {slides}
        </span>
        {slides > 1 && <span className="gallery-swipe">SWIPE TO EXPLORE</span>}
      </div>
      {viewer !== null && (
        <ImageViewer images={images} initial={Math.min(viewer, images.length - 1)} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}
function ImageViewer({ images, initial, onClose }: { images: Art[]; initial: number; onClose: () => void }) {
  const [rawIndex, setIndex] = useState(initial);
  const index = Math.min(rawIndex, images.length - 1);
  return (
    <Modal label="Artwork image viewer" onClose={onClose} className="viewer-dialog">
      {(close) => <>
        <div className="viewer-header">
          <p className="label">THE ART · {index + 1} / {images.length}</p>
          <button className="text-button" onClick={close}>CLOSE</button>
        </div>
        <ZoomableArtwork key={images[index].base} art={images[index]} index={index} count={images.length} onIndex={setIndex} />
      </>}
    </Modal>
  );
}
type Point = { x: number; y: number };
type View = Point & { zoom: number };
function ZoomableArtwork({ art, index, count, onIndex }: { art: Art; index: number; count: number; onIndex: (index: number) => void }) {
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, zoom: 1 });
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; view: View; anchor: Point } | null>(null);
  const tap = useRef<{ point: Point; time: number } | null>(null);
  const press = useRef<{ point: Point; moved: boolean } | null>(null);
  const anchor = useRef<Point | null>(null);
  const pointerType = useRef("mouse");
  function local(x: number, y: number): Point {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: x - rect.left, y: y - rect.top };
  }
  function paint(next: View) {
    const el = canvas.current!;
    const scale = Math.min(4, Math.max(1, next.zoom));
    const [width, height] = art.aspect.split(":").map(Number);
    const fittedWidth = Math.min(el.clientWidth, el.clientHeight * width / height);
    const fittedHeight = Math.min(el.clientHeight, el.clientWidth * height / width);
    // Bound the artwork itself, including object-fit's letterboxing, so a pan
    // cannot leave the shopper looking at an empty canvas.
    const bound = (offset: number, viewport: number, fitted: number) => {
      if (fitted * scale <= viewport) return viewport * (1 - scale) / 2;
      const inset = (viewport - fitted) / 2;
      return Math.min(-inset * scale, Math.max(viewport - (inset + fitted) * scale, offset));
    };
    view.current = {
      zoom: scale,
      x: bound(next.x, el.clientWidth, fittedWidth),
      y: bound(next.y, el.clientHeight, fittedHeight),
    };
    const value = view.current;
    // Keep the fitted image's layout fixed throughout pinch and pan.
    image.current!.style.transform = `translate(${value.x}px, ${value.y}px) scale(${value.zoom})`;
    setZoom(value.zoom);
  }
  // Rotation or a resized window changes the canvas; re-bound the current view so the
  // zoomed artwork can't be left outside the visible area.
  useEffect(() => {
    const el = canvas.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // At 1× the artwork is centred by layout; only a zoomed view needs re-bounding.
    const observer = new ResizeObserver(() => {
      // The viewer may be closing or swapping images when a resize lands.
      if (view.current.zoom <= 1 || canvas.current !== el || !el.isConnected || !image.current) return;
      paint(view.current);
    });
    observer.observe(el);
    return () => observer.disconnect();
    // paint reads the current art; re-subscribe when the artwork changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art.aspect]);
  function zoomAt(value: number, point = anchor.current ?? { x: canvas.current!.clientWidth / 2, y: canvas.current!.clientHeight / 2 }) {
    const previous = view.current;
    const scale = Math.min(4, Math.max(1, value));
    paint({ zoom: scale, x: point.x - (point.x - previous.x) * scale / previous.zoom, y: point.y - (point.y - previous.y) * scale / previous.zoom });
  }
  function pair() {
    const [a, b] = [...pointers.current.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  return <>
    <div
      ref={canvas}
      className="viewer-canvas"
      onDragStart={(e) => e.preventDefault()}
      onDoubleClick={(e) => { if (pointerType.current === "mouse") zoomAt(view.current.zoom > 1 ? 1 : 2.5, local(e.clientX, e.clientY)); }}
      onPointerDown={(e) => {
        if (e.button !== 0 || pointers.current.size >= 2) return;
        pointerType.current = e.pointerType;
        e.currentTarget.setPointerCapture(e.pointerId);
        const point = local(e.clientX, e.clientY);
        pointers.current.set(e.pointerId, point);
        anchor.current = point;
        press.current = { point, moved: false };
        if (pointers.current.size === 2) {
          const { distance, midpoint } = pair();
          pinch.current = { distance: Math.max(1, distance), view: { ...view.current }, anchor: midpoint };
          tap.current = null;
          press.current.moved = true;
        }
      }}
      onPointerMove={(e) => {
        const previous = pointers.current.get(e.pointerId);
        if (!previous) return;
        const point = local(e.clientX, e.clientY);
        pointers.current.set(e.pointerId, point);
        if (press.current && Math.hypot(point.x - press.current.point.x, point.y - press.current.point.y) > 8) press.current.moved = true;
        if (pointers.current.size === 2 && pinch.current) {
          const { distance, midpoint } = pair();
          const start = pinch.current;
          const scale = Math.min(4, Math.max(1, start.view.zoom * distance / start.distance));
          paint({ zoom: scale, x: midpoint.x - (start.anchor.x - start.view.x) * scale / start.view.zoom, y: midpoint.y - (start.anchor.y - start.view.y) * scale / start.view.zoom });
          anchor.current = midpoint;
        } else if (view.current.zoom > 1) {
          paint({ ...view.current, x: view.current.x + point.x - previous.x, y: view.current.y + point.y - previous.y });
        }
      }}
      onPointerUp={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        if (e.pointerType !== "mouse" && pointers.current.size === 1 && !press.current?.moved) {
          const point = local(e.clientX, e.clientY);
          const last = tap.current;
          if (last && e.timeStamp - last.time < 280 && Math.hypot(point.x - last.point.x, point.y - last.point.y) < 24) {
            zoomAt(view.current.zoom > 1 ? 1 : 2.5, point);
            tap.current = null;
          } else tap.current = { point, time: e.timeStamp };
        }
        pointers.current.delete(e.pointerId);
        pinch.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={(e) => { pointers.current.delete(e.pointerId); pinch.current = null; tap.current = null; }}
      onLostPointerCapture={(e) => { pointers.current.delete(e.pointerId); pinch.current = null; }}
    >
      <div ref={image} className="viewer-art"><ArtImage art={art} sizes="400vw" priority /></div>
    </div>
    <div className="viewer-controls">
      <button className="text-button" disabled={index === 0} onClick={() => onIndex(index - 1)}>PREVIOUS</button>
      <label>Zoom <input aria-label="Artwork zoom" type="range" min="1" max="4" step="0.1" value={zoom} onChange={(e) => zoomAt(Number(e.target.value))} /></label>
      <button className="text-button" disabled={index === count - 1} onClick={() => onIndex(index + 1)}>NEXT</button>
    </div>
  </>;
}
