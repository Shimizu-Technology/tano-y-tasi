import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router";
import { api } from "../api";
import { reconcileOrder } from "../orderState";
import { ArtImage } from "../components/ArtImage";
import { Failure, Loading, Meta } from "../components/Shared";
import { money } from "../utils";
import type { Order } from "../types";
const statusLabels: Record<Order["status"], string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  expired: "Reservation expired",
  canceled: "Canceled",
  refunded: "Refunded",
  needs_attention: "Payment under review",
};
function useReconcile(order?: Order) {
  useEffect(() => {
    if (!order) return;
    reconcileOrder(order);
  }, [order]);
}
export function OrderPage() {
  const { token } = useParams();
  const calls = useRef(0);
  const [started] = useState(Date.now);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  const q = useQuery({
    queryKey: ["order", token],
    queryFn: () => {
      calls.current++;
      return api.order(token!);
    },
    refetchInterval: (query) =>
      visible &&
      query.state.data?.order.status === "pending_payment" &&
      calls.current < 60 &&
      Date.now() - started < 10 * 60_000
        ? 5000
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  useReconcile(q.data?.order);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failure error={q.error} retry={() => void q.refetch()} />;
  const o = q.data.order;
  const recover = ["canceled", "expired"].includes(o.status);
  return (
    <div className="page order-page narrow">
      <Meta title={o.status === "paid" ? "Thank you" : "Your order"} />
      <p className="label">{o.number}</p>
      <h1>{o.status === "paid" ? "Thank you." : recover ? "Your cart is safe." : "Your order."}</h1>
      <p className="order-status" role="status">
        {statusLabels[o.status]}
      </p>
      <p className="muted">
        {o.status === "paid"
          ? "A piece of home is headed your way."
          : recover
            ? "Your reservation has ended. We’ve restored your cart so you can pick up where you left off."
            : o.status === "pending_payment"
              ? "We’re waiting for your payment confirmation. This page will update automatically."
              : o.status === "refunded"
                ? "Your payment has been refunded."
                : "Your payment needs a closer look. Keep this order link for reference."}
      </p>
      <OrderSummary order={o} />
      {o.status === "pending_payment" && (
        <>
          <button className="text-button inline-link" disabled={q.isFetching} onClick={() => void q.refetch()}>
            {q.isFetching ? "Checking…" : "Check payment status"}
          </button>
          <p className="muted small">
            Automatic checks pause when this tab is hidden and stop after 60 requests or 10 minutes. You can check again
            above.
          </p>
          <Link className="text-link" to={`/checkout/cancel/${o.token}`}>
            Cancel reservation
          </Link>
        </>
      )}
      <Link className="button" to="/shop">
        {recover ? "RETURN TO SHOP" : "CONTINUE EXPLORING"}
      </Link>
      <p className="muted small">
        Keep this private order link to check your order. Email delivery is not enabled in this preview.
      </p>
    </div>
  );
}
export function CancelPage() {
  const { token } = useParams();
  const q = useQuery({
    queryKey: ["cancel", token],
    queryFn: () => api.cancel(token!),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  useReconcile(q.data?.order);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failure error={q.error} retry={() => void q.refetch()} />;
  if (q.data.order.status === "paid") return <Navigate to={`/orders/${token}`} replace />;
  return (
    <div className="page narrow empty-page">
      <Meta title="Checkout canceled" />
      <p className="label">CHECKOUT CANCELED</p>
      <h1>No rush.</h1>
      <p>Your payment wasn’t completed. Your cart has been restored, and your reservation has been released.</p>
      <Link className="button" to="/shop">
        BACK TO THE COLLECTION
      </Link>
    </div>
  );
}
export function OrderSummary({ order: o }: { order: Order }) {
  return (
    <div className="order-summary">
      <div className="order-meta">
        <span>{o.number}</span>
        <span>{o.email_masked}</span>
      </div>
      {o.items.map((i) => (
        <div className="order-line" key={i.product_slug}>
          <ArtImage art={i.image} sizes="96px" />
          <div>
            <p>{i.name}</p>
            <p className="muted small">
              Quantity {i.quantity} · {money(i.unit_price_cents)} each
            </p>
          </div>
          <span className="price">{money(i.quantity * i.unit_price_cents)}</span>
        </div>
      ))}
      <div className="subtotal">
        <span>Total</span>
        <span>{money(o.total_cents)}</span>
      </div>
    </div>
  );
}
