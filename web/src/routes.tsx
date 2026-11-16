import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
// Either the classic home or the puzzle home, chosen when the site is built (vite.config.ts).
import { HomePage } from "@home-page";
import { Shop, Archive, Story, NotFound, Info } from "./pages/StorePages";
import { ProductPage, DropPage } from "./pages/ProductPage";
import { OrderPage, CancelPage } from "./pages/OrderPages";
export const router = createBrowserRouter([
  {
    path: "/admin/*",
    lazy: async () => ({ Component: (await import("./admin/AdminApp")).AdminApp }),
  },
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/shop", element: <Shop /> },
      { path: "/drop", element: <DropPage /> },
      { path: "/drops/:slug", element: <DropPage /> },
      { path: "/products/:slug", element: <ProductPage /> },
      { path: "/story", element: <Story /> },
      { path: "/archive", element: <Archive /> },
      { path: "/orders/:token", element: <OrderPage /> },
      { path: "/checkout/cancel/:token", element: <CancelPage /> },
      ...(import.meta.env.DEV
        ? [
            {
              path: "/checkout/simulated/:token",
              lazy: async () => ({ Component: (await import("./pages/SimulatedPage")).SimulatedPage }),
            },
          ]
        : []),
      { path: "/info/:topic", element: <Info /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
