import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Home, Shop, Archive, Story, NotFound, Info } from "./pages/StorePages";
import { ProductPage, DropPage } from "./pages/ProductPage";
import { OrderPage, CancelPage } from "./pages/OrderPages";
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
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
