import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAdminRoute,
  maskReplayNetworkRequest,
  sanitizeAnalyticsEvent,
  sanitizeAnalyticsUrl,
} from "./analytics";

describe("Tåno y Tåsi analytics privacy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("redacts Clerk invitation tickets and private order/cancellation tokens across casing and encoding", () => {
    expect(sanitizeAnalyticsUrl("/admin/sign-up?__clerk_ticket=private-ticket&redirect=/admin")).toBe(
      "/admin/sign-up?__clerk_ticket=%5BREDACTED%5D&redirect=%2Fadmin",
    );
    expect(
      sanitizeAnalyticsUrl("https://tanoytasi.shimizu-technology.com/orders/abc123secret?session_id=cs_live_999"),
    ).toBe("https://tanoytasi.shimizu-technology.com/orders/[REDACTED]?session_id=%5BREDACTED%5D");
    expect(
      sanitizeAnalyticsUrl("https://tanoytasi.shimizu-technology.com/Orders/MixedCaseToken"),
    ).toBe("https://tanoytasi.shimizu-technology.com/orders/[REDACTED]");
    expect(
      sanitizeAnalyticsUrl("https://tanoytasi.shimizu-technology.com/%6Frders/EncodedToken"),
    ).toBe("https://tanoytasi.shimizu-technology.com/orders/[REDACTED]");
    expect(
      sanitizeAnalyticsUrl("https://tanoytasi.shimizu-technology.com/checkout/cancel/cancelToken123"),
    ).toBe("https://tanoytasi.shimizu-technology.com/checkout/cancel/[REDACTED]");
    expect(
      sanitizeAnalyticsUrl("https://tanoytasi.shimizu-technology.com/Checkout/%63ancel/cancelToken123"),
    ).toBe("https://tanoytasi.shimizu-technology.com/checkout/cancel/[REDACTED]");
    expect(
      sanitizeAnalyticsUrl("https://tanoytasi.shimizu-technology.com/shop/prints"),
    ).toBe("https://tanoytasi.shimizu-technology.com/shop/prints");
  });

  it("sanitizes top-level URLs and nested replay $snapshot_data metadata", () => {
    const sanitized = sanitizeAnalyticsEvent({
      uuid: "evt-1",
      event: "$snapshot",
      properties: {
        $current_url: "https://tanoytasi.shimizu-technology.com/orders/private-token?session_id=secret",
        $pathname: "/orders/private-token",
        $snapshot_data: [
          {
            type: 4,
            data: {
              href: "https://tanoytasi.shimizu-technology.com/orders/private-token?session_id=secret",
            },
          },
        ],
      },
    });

    expect(sanitized?.properties.$current_url).toBe(
      "https://tanoytasi.shimizu-technology.com/orders/[REDACTED]?session_id=%5BREDACTED%5D",
    );
    expect(sanitized?.properties.$pathname).toBe("/orders/[REDACTED]");
    expect(sanitized?.properties.$snapshot_data).toEqual([
      {
        type: 4,
        data: {
          href: "https://tanoytasi.shimizu-technology.com/orders/[REDACTED]?session_id=%5BREDACTED%5D",
        },
      },
    ]);

    expect(
      maskReplayNetworkRequest({
        name: "https://tanoytasi.shimizu-technology.com/orders/private-token?session_id=secret",
      }),
    ).toEqual({
      name: "https://tanoytasi.shimizu-technology.com/orders/[REDACTED]?session_id=%5BREDACTED%5D",
    });
  });

  it("identifies admin, order, and cancellation routes across casing and encoding", () => {
    expect(isAdminRoute("/admin")).toBe(true);
    expect(isAdminRoute("/Admin/subscribers")).toBe(true);
    expect(isAdminRoute("/%61dmin/subscribers")).toBe(true);
    expect(isAdminRoute("/orders/private-token")).toBe(true);
    expect(isAdminRoute("/Orders/private-token")).toBe(true);
    expect(isAdminRoute("/checkout/cancel/tok123")).toBe(true);
    expect(isAdminRoute("/Checkout/%63ancel/tok123")).toBe(true);
    expect(isAdminRoute("/shop")).toBe(false);
    expect(isAdminRoute("/")).toBe(false);
  });
});
