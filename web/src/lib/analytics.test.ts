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

  it("redacts Clerk invitation tickets and private order tokens", () => {
    expect(sanitizeAnalyticsUrl("/admin/sign-up?__clerk_ticket=private-ticket&redirect=/admin")).toBe(
      "/admin/sign-up?__clerk_ticket=%5BREDACTED%5D&redirect=%2Fadmin",
    );
    expect(
      sanitizeAnalyticsUrl("https://tanoytasi.shimizu-technology.com/orders/abc123secret?session_id=cs_live_999"),
    ).toBe("https://tanoytasi.shimizu-technology.com/orders/[REDACTED]?session_id=%5BREDACTED%5D");
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

  it("identifies admin routes so subscriber views are excluded from session replay", () => {
    expect(isAdminRoute("/admin")).toBe(true);
    expect(isAdminRoute("/admin/subscribers")).toBe(true);
    expect(isAdminRoute("/shop")).toBe(false);
    expect(isAdminRoute("/")).toBe(false);
  });
});
