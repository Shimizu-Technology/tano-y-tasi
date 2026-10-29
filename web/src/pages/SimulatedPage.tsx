import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api";
import { Failure, Loading, Meta } from "../components/Shared";
import { NotFound } from "./StorePages";
import { OrderSummary } from "./OrderPages";

export function SimulatedPage() {
  const allowed =
    import.meta.env.DEV &&
    (import.meta.env.VITE_API_MOCKS === "true" || import.meta.env.VITE_SIMULATED_PAYMENTS === "true");
  return allowed ? <SimulatedPayment /> : <NotFound />;
}
function SimulatedPayment() {
  const { token } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const lock = useRef(false);
  const q = useQuery({ queryKey: ["order", token], queryFn: () => api.order(token!) });
  const pay = useMutation({
    mutationFn: (action: "complete" | "cancel") => api.simulated(token!, action),
    onSuccess: (data, action) => {
      client.setQueryData(["order", token], data);
      navigate(action === "complete" ? `/orders/${token}` : `/checkout/cancel/${token}`);
    },
    onSettled: () => {
      lock.current = false;
    },
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failure error={q.error} retry={() => void q.refetch()} />;
  return (
    <div className="page narrow test-payment">
      <Meta title="Test payment" />
      <p className="label">TEST MODE · SIMULATED PAYMENT</p>
      <h1>Complete your test order.</h1>
      <p>This is a local test payment. No card is needed and no money is charged.</p>
      <OrderSummary order={q.data.order} />
      {q.data.order.status !== "pending_payment" ? (
        <Link to={`/orders/${token}`} className="button">
          VIEW ORDER
        </Link>
      ) : (
        <div className="test-actions">
          <button
            className="button"
            disabled={pay.isPending}
            onClick={() => {
              if (lock.current) return;
              lock.current = true;
              pay.mutate("complete");
            }}
          >
            {pay.isPending ? "Processing…" : "Pay (test)"}
          </button>
          <button
            className="text-button inline-link"
            disabled={pay.isPending}
            onClick={() => {
              if (lock.current) return;
              lock.current = true;
              pay.mutate("cancel");
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {pay.isError && (
        <p className="error" role="alert">
          Payment couldn’t be updated. Please try again.
        </p>
      )}
    </div>
  );
}
