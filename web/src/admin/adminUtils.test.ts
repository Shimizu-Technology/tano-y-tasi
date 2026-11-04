import { describe, expect, it } from "vitest";
import { AdminApiError, authState, createAdminClient, fieldErrors, formError } from "./adminApi";
import {
  centsToDollars,
  dateOnly,
  dollarsToCents,
  guamInput,
  margin,
  guamToIso,
  safeReturnPath,
  signInPath,
  validateDrop,
  validateProduct,
  validateRun,
  validateSelling,
} from "./adminUtils";

describe("admin access", () => {
  it("maps API authorization and availability states", () => {
    expect(authState(new AdminApiError(401, { message: "Expired" }))).toBe("expired");
    expect(authState(new AdminApiError(403, { message: "Denied" }))).toBe("denied");
    expect(authState(new AdminApiError(503, { message: "Offline" }))).toBe("retry");
    expect(authState(new AdminApiError(0, { message: "Network" }))).toBe("retry");
    expect(authState(new AdminApiError(422, { message: "Invalid" }))).toBe("other");
    expect(authState(new AdminApiError(503, { code: "storage_unavailable", message: "Not set up" }))).toBe("other");
    expect(authState(new AdminApiError(503, { code: "payment_unavailable", message: "Retry" }))).toBe("other");
    expect(authState(new AdminApiError(503, { code: "identity_unavailable", message: "Retry" }))).toBe("retry");
    expect(authState(new AdminApiError(500, { message: "The request failed." }))).toBe("retry");
  });
  it("uses a fresh bearer token on every request and maps field errors", async () => {
    let sequence = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_, init) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer token-${++sequence}`);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = createAdminClient(async () => `token-${sequence + 1}`);
    await client("/me");
    await client("/me");
    expect(sequence).toBe(2);
    fetchMock.mockRestore();
    expect(
      fieldErrors(new AdminApiError(422, { message: "Invalid", details: { email: "Already invited" } }))
    ).toEqual({ email: "Already invited" });
    expect(
      formError(new AdminApiError(422, { message: "Invalid", details: { email: "Already invited" } }))
    ).toEqual({ fields: { email: "Already invited" }, message: "" });
    expect(formError(new AdminApiError(422, { message: "Description can't be blank", details: {} }))).toEqual({
      fields: {},
      message: "Description can't be blank",
    });
  });
});
describe("admin inputs", () => {
  it("keeps return paths inside admin on the same origin, including query and hash", () => {
    expect(safeReturnPath("/admin/orders?q=buyer%40example.com#row")).toBe(
      "/admin/orders?q=buyer%40example.com#row"
    );
    expect(safeReturnPath("//evil.example/admin")).toBe("/admin");
    expect(safeReturnPath("/\\evil.example")).toBe("/admin");
    expect(safeReturnPath("/shop")).toBe("/admin");
    expect(signInPath("/admin/orders?page=2#top")).toBe(
      "/admin/sign-in?returnTo=%2Fadmin%2Forders%3Fpage%3D2%23top"
    );
  });
  it("converts Guam wall time to UTC without a browser timezone dependency", () => {
    expect(guamToIso("2026-12-05T10:00")).toBe("2026-12-05T00:00:00.000Z");
    expect(guamInput("2026-12-05T00:00:00Z")).toBe("2026-12-05T10:00");
    expect(guamToIso("2026-02-30T10:00")).toBeNull();
  });
  it("converts exact cents and validates editable forms", () => {
    expect(dollarsToCents("45.05")).toBe(4505);
    expect(dollarsToCents("45.005")).toBeNull();
    expect(centsToDollars(4505)).toBe("45.05");
    expect(validateProduct({ name: "", summary: "", description: "", price: "1.999" })).toMatchObject({
      name: expect.any(String),
      summary: expect.any(String),
      description: expect.any(String),
      price: expect.any(String),
    });
    expect(
      validateDrop({
        name: "Drop",
        release: "2026-12-05T10:00",
        closes: "2026-12-05T09:59",
        limit: 0,
        quantity: -1,
      })
    ).toMatchObject({
      closes_at: expect.any(String),
      per_customer_limit: expect.any(String),
      quantity: expect.any(String),
    });
  });
});

describe("coming-soon drops", () => {
  const base = { name: "Map", limit: 2, quantity: 500 };
  it("accepts an empty release time", () => {
    expect(validateDrop({ ...base, release: "", closes: "" })).toEqual({});
  });
  it("needs a release time before a close time", () => {
    expect(validateDrop({ ...base, release: "", closes: "2027-01-02T10:00" }).closes_at).toMatch(/release time/);
  });
});

describe("how a product sells", () => {
  const selling = { limit: "", preorder: false, preorderShips: "" };
  it("treats an empty limit as none and wants a positive whole number otherwise", () => {
    expect(validateSelling(selling)).toEqual({});
    expect(validateSelling({ ...selling, limit: "2" })).toEqual({});
    for (const limit of ["0", "-1", "1.5", "two"]) expect(validateSelling({ ...selling, limit })).toHaveProperty("per_customer_limit");
  });
  it("needs a ship date for a preorder only", () => {
    expect(validateSelling({ ...selling, preorder: true, preorderShips: "   " })).toHaveProperty("preorder_ships");
    expect(validateSelling({ ...selling, preorder: true, preorderShips: "Ships late January 2027" })).toEqual({});
    expect(validateSelling({ ...selling, preorderShips: "x".repeat(121) })).toHaveProperty("preorder_ships");
  });
});
describe("production runs", () => {
  it("checks the quantity and the cost", () => {
    expect(validateRun({ quantity: "500", unitCost: "7.20" })).toEqual({});
    expect(validateRun({ quantity: "500", unitCost: "" })).toEqual({});
    expect(validateRun({ quantity: "0", unitCost: "7.205" })).toEqual({ quantity: expect.any(String), unit_cost_cents: expect.any(String) });
  });
  it("works out a simple margin, and none without a cost or a price", () => {
    expect(margin(4500, 720)).toBe(84);
    expect(margin(4500, 5000)).toBe(-11);
    expect(margin(4500, null)).toBeNull();
    expect(margin(0, 720)).toBeNull();
  });
  it("shows an expected date as the day it was entered, whatever the time zone", () => {
    expect(dateOnly("2027-01-15")).toBe("Jan 15, 2027");
    expect(dateOnly(null)).toBe("—");
  });
});
