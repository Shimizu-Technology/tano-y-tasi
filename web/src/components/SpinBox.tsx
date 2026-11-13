import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Art, Box } from "../types";
import { useReducedMotion } from "../useReducedMotion";
import "./SpinBox.css";

// The box rests a little turned, so it reads as an object and shows a side.
const REST = -24;
const SPIN_PER_MS = 360 / 6000;
const SETTLE_MS = 600;
// A let-go box keeps turning and slows down: its speed falls by e every GLIDE_MS.
const GLIDE_MS = 320;
const MAX_FLICK = 1.2;
const STILL = 0.004;
// Seen edge-on a box is a sliver, so it never rests within this many degrees of that.
const EDGE = 20;
const ratio = (art: Art) => {
  const [w, h] = art.aspect.split(":").map(Number);
  return w / h;
};
// The nearest pose facing squarely front or back: every 180 degrees from REST.
const nearest = (angle: number) => REST + Math.round((angle - REST) / 180) * 180;
const showsBack = (angle: number) => Math.cos((angle * Math.PI) / 180) < 0;
// Where a box left at `angle` rests: where it is, unless that is edge-on.
function resting(angle: number) {
  const within = ((angle % 180) + 180) % 180;
  if (Math.abs(within - 90) >= EDGE) return angle;
  return angle - within + (within < 90 ? 90 - EDGE : 90 + EDGE);
}

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
 * it, after one small turn the first time it is seen. Let go, it glides to a stop and stays where
 * it was left. `controls` adds a button that turns it to the other face, for keyboards.
 */
export function SpinBox({ box, sizes = "(min-width: 900px) 30vw, 60vw", priority = false, controls = false }: {
  box: Box;
  sizes?: string;
  priority?: boolean;
  controls?: boolean;
}) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const angle = useRef(REST);
  const frame = useRef(0);
  // What the running frame loop is doing: the hover spin, or the glide after a let-go.
  const motion = useRef<"spin" | "glide" | null>(null);
  const drag = useRef<{ id: number; x: number; from: number; moved: boolean; at: number; speed: number } | null>(null);
  const dragged = useRef(false);
  const forget = useRef(0);
  const [back, setBack] = useState(false);

  function turn(next: number, animate: boolean) {
    angle.current = next;
    setBack(showsBack(next));
    const el = body.current;
    if (!el) return;
    el.style.transition = animate && !reduced ? `transform ${SETTLE_MS}ms var(--ease-out)` : "none";
    el.style.transform = `rotateY(${Number(next.toFixed(2))}deg)`;
  }
  function stop() {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    motion.current = null;
  }
  // Leaves the box where it is, eased off an edge-on pose.
  function rest() {
    stop();
    const next = resting(angle.current);
    if (next !== angle.current) turn(next, true);
  }
  function run(kind: "spin" | "glide", speed: number) {
    stop();
    if (reduced || (kind === "glide" && Math.abs(speed) < STILL)) return rest();
    motion.current = kind;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      if (kind === "glide") {
        speed *= Math.exp(-dt / GLIDE_MS);
        if (Math.abs(speed) < STILL) return rest();
      }
      turn(angle.current + speed * dt, false);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }
  useEffect(() => () => { stop(); clearTimeout(forget.current); }, []);
  // Turning reduced motion on stops whatever is moving at once: a spin or a glide stops where it
  // is, and a hint or a settle jumps to the pose it was heading for.
  useEffect(() => {
    if (!reduced) return;
    stop();
    turn(resting(angle.current), false);
    // turn only touches refs and a state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  // Ends a press however it ends: released here or elsewhere, cancelled, or taken over by a scroll.
  function release(e: ReactPointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || state.id !== e.pointerId) return;
    drag.current = null;
    const rect = e.currentTarget.getBoundingClientRect();
    const away = e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
    // A flick carries on; a box held still before the let-go stays put.
    if (state.moved) run("glide", e.timeStamp - state.at > 90 ? 0 : Math.max(-MAX_FLICK, Math.min(MAX_FLICK, state.speed)));
    // While captured the stage hears no leave, so a press let go elsewhere ends the hover spin here.
    else if (away && motion.current === "spin") run("glide", SPIN_PER_MS);
    // The captured press would click here even when let go elsewhere; that isn't a click on the box.
    if (away) dragged.current = true;
    // Only the click that this drag itself produces is swallowed.
    forget.current = window.setTimeout(() => { dragged.current = false; }, 80);
  }

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
    // turn only touches refs and a state setter.
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
        onPointerEnter={(e) => { if (mouse(e) && !drag.current) run("spin", SPIN_PER_MS); }}
        onPointerLeave={(e) => { if (mouse(e) && !drag.current && motion.current === "spin") run("glide", SPIN_PER_MS); }}
        onPointerDown={(e) => {
          if (e.button !== 0 || drag.current) return;
          drag.current = { id: e.pointerId, x: e.clientX, from: angle.current, moved: false, at: e.timeStamp, speed: 0 };
          // A finger stops a gliding box where it catches it; a mouse's hover spin runs on until it drags.
          if (motion.current === "glide") stop();
          // An earlier press's timer must not clear this one's flag.
          clearTimeout(forget.current);
          dragged.current = false;
          // Captured from the press, so a release anywhere still ends it.
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const state = drag.current;
          if (!state || state.id !== e.pointerId) return;
          const dx = e.clientX - state.x;
          if (!state.moved) {
            if (Math.abs(dx) < 6) return;
            state.moved = true;
            dragged.current = true;
            stop();
            state.from = angle.current;
            state.x = e.clientX;
            state.at = e.timeStamp;
            return;
          }
          const next = state.from + dx * 0.6;
          const dt = e.timeStamp - state.at;
          // Smoothed, so one jittery sample doesn't decide the flick.
          if (dt > 0) state.speed = state.speed * 0.4 + ((next - angle.current) / dt) * 0.6;
          state.at = e.timeStamp;
          turn(next, false);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        // A drag that ends over a link must not follow it.
        onClickCapture={(e) => { if (dragged.current) { dragged.current = false; e.preventDefault(); e.stopPropagation(); } }}
        // Inside a link the browser would otherwise start dragging the link itself and cancel the pointer.
        // Cancelling the press also cancels its focus, so the link is focused by hand.
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.closest("a")?.focus({ preventScroll: true });
        }}
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
        <button
          type="button"
          className="spin-box-turn text-button label"
          onClick={() => {
            stop();
            // The squarely facing pose nearest to where the box is, on the side it isn't showing.
            const square = nearest(angle.current);
            turn(showsBack(square) === showsBack(angle.current) ? square + 180 : square, true);
          }}
        >
          {back ? "SHOW THE FRONT" : "SHOW THE BACK"}
        </button>
      )}
    </div>
  );
}
