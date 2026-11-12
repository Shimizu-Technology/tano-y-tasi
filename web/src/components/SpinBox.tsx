import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Art, Box } from "../types";
import { useReducedMotion } from "../useReducedMotion";
import "./SpinBox.css";

// The box rests a little turned, so it reads as an object and shows a side.
const REST = -24;
const SPIN_PER_MS = 360 / 6000;
const SETTLE_MS = 600;
const ratio = (art: Art) => {
  const [w, h] = art.aspect.split(":").map(Number);
  return w / h;
};
// The nearest resting pose: every `step` degrees from REST.
const nearest = (angle: number, step: number) => REST + Math.round((angle - REST) / step) * step;
const showsBack = (angle: number) => Math.abs(Math.round((angle - REST) / 180)) % 2 === 1;

function Face({ art, side, sizes, priority, silent = false }: { art: Art | null; side: string; sizes: string; priority: boolean; silent?: boolean }) {
  if (!art) return <span className={`spin-box-face spin-box-${side}`} aria-hidden="true" />;
  const narrow = side === "left" || side === "right";
  return (
    <img
      className={`spin-box-face spin-box-${side}`}
      src={`${art.base}-${art.widths[0]}.webp`}
      srcSet={art.widths.map((w) => `${art.base}-${w}.webp ${w}w`).join(", ")}
      sizes={narrow ? "96px" : sizes}
      alt={narrow || silent ? "" : art.alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority && side === "front" ? "high" : "auto"}
      draggable={false}
    />
  );
}

/**
 * A puzzle box built from its flat faces. A mouse turns it by hovering or dragging; a finger drags
 * it, after one small turn the first time it is seen. `controls` adds a button for keyboards and
 * for places where a swipe already means something else (`touchDrag={false}`).
 */
export function SpinBox({ box, sizes = "(min-width: 900px) 30vw, 60vw", priority = false, controls = false, touchDrag = true }: {
  box: Box;
  sizes?: string;
  priority?: boolean;
  controls?: boolean;
  touchDrag?: boolean;
}) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const angle = useRef(REST);
  const frame = useRef(0);
  const drag = useRef<{ id: number; x: number; from: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const [back, setBack] = useState(false);

  function turn(next: number, animate: boolean) {
    angle.current = next;
    const el = body.current;
    if (!el) return;
    el.style.transition = animate && !reduced ? `transform ${SETTLE_MS}ms var(--ease-out)` : "none";
    el.style.transform = `rotateY(${next}deg)`;
  }
  function stopSpin() {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }
  function settle(step: number) {
    stopSpin();
    const next = nearest(angle.current, step);
    turn(next, true);
    setBack(showsBack(next));
  }
  function spin() {
    if (frame.current || reduced || drag.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      turn(angle.current + (now - last) * SPIN_PER_MS, false);
      last = now;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }
  useEffect(() => stopSpin, []);

  // One small turn the first time a touch screen shows the box, so it reads as something to turn.
  useEffect(() => {
    const el = root.current;
    if (!el || reduced || typeof IntersectionObserver === "undefined" || !window.matchMedia?.("(hover: none)").matches) return;
    let timer = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      if (drag.current || angle.current !== REST) return;
      turn(REST - 56, true);
      timer = window.setTimeout(() => { if (!drag.current && angle.current === REST - 56) turn(REST, true); }, SETTLE_MS + 150);
    }, { threshold: 0.75 });
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(timer); };
    // turn only touches refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const mouse = (e: ReactPointerEvent) => e.pointerType === "mouse";
  const front = ratio(box.front);
  // A side's width is the box's depth. Without side art the box is a slim default.
  const side = box.left ?? box.right;
  const depth = side ? Number((ratio(side) / front).toFixed(4)) : 0.14;
  return (
    <div className="spin-box" ref={root} style={{ "--box-ratio": front, "--box-depth": depth } as CSSProperties}>
      <div
        className="spin-box-stage"
        data-touch-drag={touchDrag || undefined}
        onPointerEnter={(e) => { if (mouse(e)) spin(); }}
        onPointerLeave={(e) => { if (mouse(e) && !drag.current) settle(360); }}
        onPointerDown={(e) => {
          if (e.button !== 0 || drag.current || (!touchDrag && !mouse(e))) return;
          drag.current = { id: e.pointerId, x: e.clientX, from: angle.current, moved: false };
          dragged.current = false;
        }}
        onPointerMove={(e) => {
          const state = drag.current;
          if (!state || state.id !== e.pointerId) return;
          const dx = e.clientX - state.x;
          if (!state.moved) {
            if (Math.abs(dx) < 6) return;
            state.moved = true;
            dragged.current = true;
            stopSpin();
            state.from = angle.current;
            state.x = e.clientX;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            return;
          }
          turn(state.from + dx * 0.6, false);
        }}
        onPointerUp={(e) => {
          const state = drag.current;
          if (!state || state.id !== e.pointerId) return;
          drag.current = null;
          if (state.moved) settle(180);
        }}
        onPointerCancel={() => { if (drag.current?.moved) settle(180); drag.current = null; }}
        // A drag that ends over a link must not follow it.
        onClickCapture={(e) => { if (dragged.current) { dragged.current = false; e.preventDefault(); e.stopPropagation(); } }}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="spin-box-body" ref={body} style={{ transform: `rotateY(${REST}deg)` }}>
          <Face art={box.front} side="front" sizes={sizes} priority={priority} />
          {/* Inside a link the front names the box; the back is described where it can be turned to with the button. */}
          <Face art={box.back} side="back" sizes={sizes} priority={false} silent={!controls} />
          <Face art={box.left} side="left" sizes={sizes} priority={false} />
          <Face art={box.right} side="right" sizes={sizes} priority={false} />
        </div>
      </div>
      {controls && (
        <button type="button" className="spin-box-turn text-button label" onClick={() => { stopSpin(); const next = nearest(angle.current, 180) + 180; turn(next, true); setBack(showsBack(next)); }}>
          {back ? "SHOW THE FRONT" : "SHOW THE BACK"}
        </button>
      )}
    </div>
  );
}
