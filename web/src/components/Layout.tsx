import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, NavLink, Outlet, ScrollRestoration } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useCart } from "../cart";
import { Wordmark } from "./Shared";
import { Modal } from "./Modal";
import { CartDrawer } from "./CartDrawer";
const CartContext = createContext<() => void>(() => {});
export const useOpenCart = () => useContext(CartContext);
const links = [
  ["/shop", "SHOP"],
  ["/drop", "DROP"],
  ["/story", "STORY"],
  ["/archive", "ARCHIVE"],
];
function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
export function Layout() {
  // Recheck after subscribing, including scroll restoration during route mounting.
  const scrolled = useSyncExternalStore(subscribeToScroll, () => window.scrollY > 0, () => false);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const items = useCart((s) => s.items);
  const { data } = useQuery({ queryKey: ["storefront"], queryFn: api.storefront });
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const countRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let animation: Animation | undefined;
    // Subscribe after mounting: persisted carts never tick on initial load.
    const unsubscribe = useCart.subscribe((next, previous) => {
      const total = (state: typeof next) => state.items.reduce((sum, item) => sum + item.quantity, 0);
      if (total(next) <= total(previous)) return;
      animation?.cancel();
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      animation = countRef.current?.animate?.(reduce
        ? [{ opacity: 0.55 }, { opacity: 1 }]
        : [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.15)", opacity: 0.7, offset: 0.4 }, { transform: "scale(1)", opacity: 1 }],
      { duration: reduce ? 100 : 240, easing: "cubic-bezier(0.23,1,0.32,1)" });
    });
    return () => { unsubscribe(); animation?.cancel(); };
  }, []);
  const live = data?.featured_drop?.state === "live";
  const nav = (mobile = false, close = () => setMenuOpen(false)) => (
    <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"}>
      {links.map(([href, label]) => (
        <NavLink key={href} to={href} onClick={close}>
          {label}
          {label === "DROP" && live && <span className="live-dot" aria-label="Live" />}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <CartContext.Provider value={() => setCartOpen(true)}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
        <Link to="/" aria-label="Tåno + Tåsi home">
          <Wordmark />
        </Link>
        <div className="header-actions">
          <div className="desktop-nav">{nav()}</div>
          <button className="text-button menu-trigger" onClick={() => setMenuOpen(true)}>
            MENU
          </button>
          <button className="text-button" onClick={() => setCartOpen(true)} aria-haspopup="dialog" aria-label={`CART (${count})`}>
            CART (<span className="cart-count" ref={countRef}>{count}</span>)
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
      {menuOpen && (
        <Modal label="Menu" className="menu-dialog" onClose={() => setMenuOpen(false)}>
          {(close) => <>
          <div className="drawer-header">
            <Wordmark />
            <button className="text-button" onClick={close}>
              CLOSE
            </button>
          </div>
          {nav(true, close)}
          <p className="label muted menu-signoff">
            GUÅHAN · MARIANA ISLANDS
            <br />A PIECE OF HOME.
          </p>
          </>}
        </Modal>
      )}
      <ScrollRestoration />
    </CartContext.Provider>
  );
}
function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Link to="/" aria-label="Tåno + Tåsi home">
          <img
            src="/images/brand/logo-mark-800.png"
            width="112"
            height="90"
            alt="Tåno Tåsi, land and sea"
            loading="lazy"
          />
        </Link>
        <p>
          Made for Guåhan and everyone
          <br />
          carrying it with them.
        </p>
        <div className="footer-links">
          <Link to="/info/shipping">Shipping</Link>
          <Link to="/info/faq">FAQ</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} TÅNO + TÅSI</span>
        <span>ISLAND SUPPLY CO.</span>
        <span>13.4443° N, 144.7937° E</span>
      </div>
    </footer>
  );
}
