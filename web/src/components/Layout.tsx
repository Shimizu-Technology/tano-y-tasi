import { createContext, useContext, useState } from "react";
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
export function Layout() {
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const items = useCart((s) => s.items);
  const { data } = useQuery({ queryKey: ["storefront"], queryFn: api.storefront });
  const live = data?.featured_drop?.state === "live";
  const nav = (mobile = false) => (
    <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"}>
      {links.map(([href, label]) => (
        <NavLink key={href} to={href} onClick={() => setMenuOpen(false)}>
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
      <header className="site-header">
        <Link to="/" aria-label="Tåno + Tåsi home">
          <Wordmark />
        </Link>
        <div className="header-actions">
          <div className="desktop-nav">{nav()}</div>
          <button className="text-button menu-trigger" onClick={() => setMenuOpen(true)}>
            MENU
          </button>
          <button className="text-button" onClick={() => setCartOpen(true)} aria-haspopup="dialog">
            CART ({items.reduce((sum, i) => sum + i.quantity, 0)})
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
          <div className="drawer-header">
            <Wordmark />
            <button className="text-button" onClick={() => setMenuOpen(false)}>
              CLOSE
            </button>
          </div>
          {nav(true)}
          <p className="label muted menu-signoff">
            GUÅHAN · MARIANA ISLANDS
            <br />A PIECE OF HOME.
          </p>
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
          <Link to="/info/shipping">Shipping & Returns</Link>
          <Link to="/info/faq">FAQ</Link>
          <span>Wholesale — coming soon</span>
          <Link to="/info/contact">Contact</Link>
          <span>Instagram — coming soon</span>
          <span>TikTok — coming soon</span>
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
