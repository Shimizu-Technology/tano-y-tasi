import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const LOOK5_HERO_SEEN = "tyt-look5-hero-seen";

export function HeroEntrance({ children, className = "sunhill-identity" }: { children: ReactNode; className?: string }) {
  const [enter, setEnter] = useState(() => {
    try { return sessionStorage.getItem(LOOK5_HERO_SEEN) !== "true"; }
    catch { return false; } // With no session storage, leave content still and visible.
  });
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!enter) return;
    // Freeze this set on the first commit: a refetch must not animate inserted content.
    for (const child of [...(root.current?.children ?? [])].slice(0, 4)) child.setAttribute("data-enter-item", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(LOOK5_HERO_SEEN, "true"); } catch { /* Visible fallback. */ }
    if (!enter) return;
    const timer = setTimeout(() => setEnter(false), 400);
    return () => clearTimeout(timer);
  }, [enter]);
  return <div ref={root} className={`${className} look5-entrance`} data-enter={enter ? "once" : undefined}>{children}</div>;
}
