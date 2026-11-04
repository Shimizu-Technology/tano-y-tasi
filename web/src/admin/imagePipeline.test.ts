import { describe, expect, it } from "vitest";
import { aspectRatio, prepareImage, ImageRejected, rejection, sizeRejection, targetWidths } from "./imagePipeline";
import { placeholderFields, togglePlaceholder } from "./adminUtils";

describe("image sizes", () => {
  it("never upscales and always keeps at least one size", () => {
    expect(targetWidths(4000)).toEqual([640, 1280, 2000]);
    expect(targetWidths(2000)).toEqual([640, 1280, 2000]);
    expect(targetWidths(1999)).toEqual([640, 1280]);
    expect(targetWidths(640)).toEqual([640]);
    expect(targetWidths(100)).toEqual([640]);
  });
  it("reduces the aspect from the source", () => {
    expect(aspectRatio(4032, 3024)).toBe("4:3");
    expect(aspectRatio(1600, 1000)).toBe("8:5");
    expect(aspectRatio(1999, 1333)).toBe("1999:1333");
  });
  it("explains a rejected file in plain words", () => {
    expect(rejection({ name: "notes.pdf", type: "application/pdf" })).toMatch(/notes\.pdf isn't an image/);
    expect(rejection({ name: "photo.jpg", type: "image/jpeg" })).toBeNull();
    expect(sizeRejection("tiny.png", 639)).toMatch(/only 639 pixels wide/);
    expect(sizeRejection("ok.png", 640)).toBeNull();
  });
  it("refuses a non-image before trying to read it", async () => {
    await expect(prepareImage(new File(["x"], "notes.txt", { type: "text/plain" }))).rejects.toBeInstanceOf(ImageRejected);
  });
});

describe("placeholder checklist", () => {
  it("offers exactly the storefront's keys", () => {
    expect(placeholderFields.map((field) => field.key)).toEqual([
      "price_cents", "stock_quantity", "specs.piece_count", "specs.finished_size", "specs.box_size", "specs.material",
      "specs.cut", "specs.made_in", "includes", "art.credit", "drop.release_at", "drop.quantity",
    ]);
  });
  it("keeps keys it doesn't know about", () => {
    const list = ["price_cents", "future.thing"];
    expect(togglePlaceholder(list, "art.credit", true)).toEqual(["price_cents", "future.thing", "art.credit"]);
    expect(togglePlaceholder(list, "price_cents", false)).toEqual(["future.thing"]);
    expect(togglePlaceholder(list, "price_cents", true)).toEqual(["future.thing", "price_cents"]);
  });
});
