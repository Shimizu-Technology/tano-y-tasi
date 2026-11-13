import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";

const EXIT_MS = 160;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

type Drag = { id: number; x: number; y: number; time: number; horizontal: boolean };

function ModalBody({ render, onClose }: { render: (close: () => void) => ReactNode; onClose: () => void }) {
  return render(onClose);
}

export function Modal({
  children,
  label,
  onClose,
  className = "",
  swipeToDismiss = false,
}: {
  children: ReactNode | ((close: () => void) => ReactNode);
  label: string;
  onClose: () => void;
  className?: string;
  swipeToDismiss?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const onClosed = useRef(onClose);
  useEffect(() => { onClosed.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current!;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? dialog.querySelector<HTMLElement>("button,a[href],input"))?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => {
      if (timer.current) clearTimeout(timer.current);
      dialog.close();
      document.body.style.overflow = overflow;
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  function close() {
    if (timer.current) return;
    drag.current = null;
    ref.current?.removeAttribute("data-dragging");
    ref.current?.style.removeProperty("transform");
    setClosing(true);
    // A timer also completes the lifecycle when a browser skips transitionend.
    timer.current = setTimeout(() => onClosed.current(), reducedMotion() ? 100 : EXIT_MS);
  }
  function finishDrag(e: PointerEvent<HTMLDialogElement>, cancelled = false) {
    const start = drag.current;
    if (!start || start.id !== e.pointerId) return;
    drag.current = null;
    const dialog = e.currentTarget;
    if (cancelled) dragged.current = false;
    dialog.removeAttribute("data-dragging");
    const dx = e.clientX - start.x;
    const dismiss = !cancelled && start.horizontal && dx > 0 &&
      (dx > dialog.getBoundingClientRect().width * 0.3 || dx / Math.max(1, e.timeStamp - start.time) > 0.11);
    if (dismiss) close();
    else dialog.style.removeProperty("transform");
    if (dialog.hasPointerCapture?.(e.pointerId)) dialog.releasePointerCapture(e.pointerId);
  }
  return (
    <dialog
      ref={ref}
      className={className}
      data-state={closing ? "closing" : "open"}
      aria-label={label}
      onPointerDown={(e) => {
        if (e.isPrimary !== false && !drag.current) dragged.current = false;
        if (!swipeToDismiss || closing || drag.current || e.isPrimary === false || e.button !== 0 ||
          !window.matchMedia?.("(max-width: 899px)").matches ||
          (e.target as HTMLElement).closest("button,input,a,select,textarea")) return;
        dragged.current = false;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp, horizontal: false };
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (!start || start.id !== e.pointerId) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!start.horizontal) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
          if (Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; }
          start.horizontal = true;
          dragged.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.setAttribute("data-dragging", "");
        }
        if (!reducedMotion()) e.currentTarget.style.transform = `translateX(${dx < 0 ? dx / (1 + Math.abs(dx) / 60) : dx}px)`;
      }}
      onPointerUp={(e) => finishDrag(e)}
      onPointerCancel={(e) => finishDrag(e, true)}
      onLostPointerCapture={(e) => { if (e.target === e.currentTarget) finishDrag(e, true); }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || !e.currentTarget.contains(document.activeElement))) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClickCapture={(e) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); dragged.current = false; } }}
      onClick={(e) => { if (e.target === ref.current) close(); }}
    >
      {typeof children === "function" ? <ModalBody render={children} onClose={close} /> : children}
    </dialog>
  );
}
