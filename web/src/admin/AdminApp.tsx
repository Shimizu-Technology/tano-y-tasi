import { useEffect, useMemo, useRef, useState } from "react";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from "@clerk/clerk-react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Package,
  Shield,
  Store,
  Users,
  X,
} from "lucide-react";
import { AdminApiContext, authState, createAdminClient, type AdminUser, type TokenGetter } from "./adminApi";
import { safeReturnPath, signInPath } from "./adminUtils";
import {
  DashboardPage,
  OrdersPage,
  OrderPage,
  ProductsPage,
  ProductPage,
  DropsPage,
  DropPage,
  SubscribersPage,
  AdminsPage,
} from "./AdminPages";
import "./admin.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const appearance = {
  variables: {
    colorPrimary: "#141311",
    colorText: "#141311",
    colorBackground: "#f5f0e7",
    colorInputBackground: "#fbf8f2",
    colorInputText: "#141311",
    fontFamily: '"Archivo Variable", sans-serif',
    borderRadius: "0px",
  },
  elements: {
    card: { boxShadow: "none", border: "1px solid #ddd5c8", borderRadius: "0" },
    formButtonPrimary: { borderRadius: "0" },
    formFieldInput: { borderRadius: "0" },
    socialButtonsBlockButton: { borderRadius: "0" },
  },
};

type Identity = { loaded: boolean; signedIn: boolean; getToken: TokenGetter; signOut: () => Promise<void> };
function ClerkIdentity() {
  const auth = useAuth();
  const clerk = useClerk();
  return (
    <AdminGate
      identity={{
        loaded: auth.isLoaded,
        signedIn: !!auth.isSignedIn,
        getToken: auth.getToken,
        signOut: async () => {
          await clerk.signOut();
        },
      }}
    />
  );
}
function AuthPage({ signup = false }: { signup?: boolean }) {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const entry = signup ? "/admin/sign-up" : "/admin/sign-in";
  const incoming = query.get("returnTo");
  const destination = safeReturnPath(incoming || sessionStorage.getItem("tyt-admin-return"));
  const ticket = query.get("__clerk_ticket");
  useEffect(() => {
    if (incoming && location.pathname === entry)
      sessionStorage.setItem("tyt-admin-return", safeReturnPath(incoming));
    if (signup && ticket) sessionStorage.setItem("tyt-admin-invitation-progress", "1");
  }, [incoming, location.pathname, entry, signup, ticket]);
  const invited =
    !!ticket ||
    (location.pathname !== entry && sessionStorage.getItem("tyt-admin-invitation-progress") === "1");
  return (
    <main className="admin-auth">
      <Link to="/" className="admin-wordmark">
        TÅNO + TÅSI
      </Link>
      <p className="admin-eyebrow">Merchant admin</p>
      {signup ? (
        invited ? (
          <SignUp
            routing="path"
            path="/admin/sign-up"
            forceRedirectUrl={destination}
            signInUrl="/admin/sign-in"
            appearance={appearance}
          />
        ) : (
          <div className="admin-auth-message">
            <h1>Invitation required</h1>
            <p>Use the link in your admin invitation email.</p>
            <Link to="/admin/sign-in">Sign in</Link>
          </div>
        )
      ) : (
        <SignIn routing="path" path="/admin/sign-in" forceRedirectUrl={destination} appearance={appearance} />
      )}
    </main>
  );
}
function StateScreen({
  title,
  message,
  retry,
  signOut,
  expired = false,
}: {
  title: string;
  message: string;
  retry?: () => void;
  signOut: () => Promise<void>;
  expired?: boolean;
}) {
  return (
    <main className="admin-state">
      <div>
        <p className="admin-eyebrow">TÅNO + TÅSI / ADMIN</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="admin-actions">
          {retry && (
            <button className="admin-button" onClick={retry}>
              {expired ? "Refresh session" : "Retry"}
            </button>
          )}
          <button className="admin-button secondary" onClick={() => void signOut()}>
            {expired ? "Sign in again" : "Switch account / Sign out"}
          </button>
        </div>
      </div>
    </main>
  );
}
function AdminGate({ identity }: { identity: Identity }) {
  const location = useLocation();
  const navigate = useNavigate();
  const authRoute = /^\/admin\/sign-(?:in|up)(?:\/|$)/.test(location.pathname);
  const [attempt, setAttempt] = useState(0);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const client = useMemo(() => createAdminClient(identity.getToken), [identity.getToken]);
  const gatedClient = useMemo(
    () =>
      async <T,>(
        path: string,
        options?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; csv?: boolean }
      ) => {
        try {
          return await client<T>(path, options);
        } catch (cause) {
          if (authState(cause) !== "other") setError(cause);
          throw cause;
        }
      },
    [client]
  );
  useEffect(() => {
    if (!identity.loaded || !identity.signedIn) return;
    let live = true;
    client<{ user: AdminUser }>("/me")
      .then((result) => {
        if (live) {
          setUser(result.user);
          setError(null);
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (live) {
          setUser(null);
          setError(cause);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [identity.loaded, identity.signedIn, client, attempt]);
  useEffect(() => {
    if (user && authRoute) {
      const returnTo = safeReturnPath(
        new URLSearchParams(location.search).get("returnTo") || sessionStorage.getItem("tyt-admin-return")
      );
      sessionStorage.removeItem("tyt-admin-return");
      sessionStorage.removeItem("tyt-admin-invitation-progress");
      navigate(returnTo === location.pathname ? "/admin" : returnTo, { replace: true });
    }
  }, [user, authRoute, location.pathname, location.search, navigate]);
  const signOut = async () => {
    await identity.signOut();
    setUser(null);
    navigate("/admin/sign-in", { replace: true });
  };
  if (!identity.loaded)
    return (
      <main className="admin-state" role="status">
        Loading admin session…
      </main>
    );
  if (!identity.signedIn) {
    if (new URLSearchParams(location.search).has("__clerk_ticket") && !authRoute)
      return <InvitationRedirect />;
    if (authRoute) return <AuthPage signup={location.pathname.startsWith("/admin/sign-up")} />;
    return <SignInRedirect />;
  }
  if (loading && !error && !user)
    return (
      <main className="admin-state" role="status">
        Checking admin access…
      </main>
    );
  if (error) {
    const state = authState(error);
    if (state === "expired")
      return (
        <StateScreen
          title="Session expired"
          message="Refresh your session or sign in again."
          retry={() => {
            setLoading(true);
            setError(null);
            setAttempt((n) => n + 1);
          }}
          signOut={signOut}
          expired
        />
      );
    if (state === "denied")
      return (
        <StateScreen
          title="Access denied"
          message="This account does not have active admin access."
          signOut={signOut}
        />
      );
    return (
      <StateScreen
        title="Admin unavailable"
        message="We could not verify your admin access. Please try again."
        retry={() => {
          setLoading(true);
          setError(null);
          setAttempt((n) => n + 1);
        }}
        signOut={signOut}
      />
    );
  }
  if (!user)
    return (
      <main className="admin-state" role="status">
        Checking admin access…
      </main>
    );
  return (
    <AdminApiContext.Provider value={gatedClient}>
      <AdminShell user={user} signOut={signOut} />
    </AdminApiContext.Provider>
  );
}
function InvitationRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const ticket = new URLSearchParams(location.search).get("__clerk_ticket");
    if (ticket) navigate(`/admin/sign-up?__clerk_ticket=${encodeURIComponent(ticket)}`, { replace: true });
  }, [location.search, navigate]);
  return (
    <main className="admin-state" role="status">
      Opening invitation…
    </main>
  );
}
function SignInRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(signInPath(`${location.pathname}${location.search}${location.hash}`), { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);
  return (
    <main className="admin-state" role="status">
      Opening sign in…
    </main>
  );
}
const nav = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Orders", path: "/admin/orders", icon: ClipboardList },
  { label: "Products", path: "/admin/products", icon: Package },
  { label: "Drops", path: "/admin/drops", icon: Archive },
  { label: "Subscribers", path: "/admin/subscribers", icon: Mail },
  { label: "Admins", path: "/admin/admins", icon: Shield },
];
function AdminShell({ user, signOut }: { user: AdminUser; signOut: () => Promise<void> }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("tyt-admin-sidebar") === "collapsed");
  const [drawer, setDrawer] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawer(false);
        menuRef.current?.focus();
      }
      if (event.key !== "Tab") return;
      const panel = document.querySelector<HTMLElement>(".admin-sidebar.open");
      const focusable = Array.from(
        panel?.querySelectorAll<HTMLElement>("a, button:not([disabled])") ?? []
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKey);
    };
  }, [drawer]);
  const section = location.pathname.split("/")[2];
  const title = nav.find((item) => item.path === `/admin/${section}`)?.label ?? "Dashboard";
  let page = <DashboardPage />;
  if (section === "orders") page = location.pathname.split("/")[3] ? <OrderPage /> : <OrdersPage />;
  if (section === "products") page = location.pathname.split("/")[3] ? <ProductPage /> : <ProductsPage />;
  if (section === "drops") page = location.pathname.split("/")[3] ? <DropPage /> : <DropsPage />;
  if (section === "subscribers") page = <SubscribersPage />;
  if (section === "admins") page = <AdminsPage currentUser={user} />;
  return (
    <div className={`admin-app ${collapsed ? "collapsed" : ""}`}>
      {drawer && <button className="admin-scrim" aria-label="Close menu" onClick={() => setDrawer(false)} />}
      <aside
        className={`admin-sidebar ${drawer ? "open" : ""}`}
        aria-label="Admin navigation"
        role={drawer ? "dialog" : undefined}
        aria-modal={drawer || undefined}
      >
        <div className="admin-sidebar-top">
          <Link to="/admin" className="admin-wordmark">
            {collapsed ? "T+T" : "TÅNO + TÅSI"}
          </Link>
          <button
            className="admin-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => {
              const value = !collapsed;
              setCollapsed(value);
              localStorage.setItem("tyt-admin-sidebar", value ? "collapsed" : "expanded");
            }}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
          <button
            ref={closeRef}
            className="admin-close"
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
          >
            <X />
          </button>
        </div>
        <p className="admin-sidebar-label">{!collapsed && "MERCHANT ADMIN"}</p>
        <nav onClick={() => setDrawer(false)}>
          {nav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-nav-link ${location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(`${item.path}/`)) ? "active" : ""}`}
              aria-current={location.pathname === item.path ? "page" : undefined}
            >
              <item.icon size={19} strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <div className="admin-account">
            <Users size={17} />
            <span title={user.email}>{user.email}</span>
          </div>
          <Link to="/" className="admin-nav-link">
            <Store size={19} />
            <span>View store</span>
          </Link>
          <button className="admin-nav-link" onClick={() => void signOut()}>
            <LogOut size={19} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <div className="admin-main-wrap">
        <header className="admin-mobile-header">
          <button ref={menuRef} aria-label="Open menu" onClick={() => setDrawer(true)}>
            <Menu />
          </button>
          <span>TÅNO + TÅSI</span>
          <span className="admin-mobile-title">{title}</span>
        </header>
        <main className="admin-content" id="main-content">
          {page}
        </main>
      </div>
    </div>
  );
}
export function AdminApp() {
  if (import.meta.env.DEV && import.meta.env.VITE_ADMIN_TEST_AUTH === "true") return <TestAdminApp />;
  if (!publishableKey)
    return (
      <main className="admin-state">
        <div>
          <h1>Admin not configured</h1>
          <p>Sign in is unavailable. Please contact the site owner.</p>
          <Link to="/">View store</Link>
        </div>
      </main>
    );
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={appearance} afterSignOutUrl="/admin/sign-in">
      <ClerkIdentity />
    </ClerkProvider>
  );
}
function TestAdminApp() {
  const [Shim, setShim] = useState<null | React.ComponentType>(null);
  useEffect(() => {
    if (import.meta.env.DEV)
      void import("./TestAuthShim").then((module) => setShim(() => module.TestAuthShim));
  }, []);
  return Shim ? (
    <Shim />
  ) : (
    <main className="admin-state" role="status">
      Loading test session…
    </main>
  );
}
export { AdminGate };
