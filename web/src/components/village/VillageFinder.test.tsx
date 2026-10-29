import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VillageFinder } from "./VillageFinder";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => vi.unstubAllGlobals());

it("starts with the whole island and a labelled native select", () => {
  render(<VillageFinder />);
  expect(screen.getByRole("combobox", { name: "Choose a village" })).toHaveValue("");
  expect(screen.getAllByRole("option")).toHaveLength(20);
  expect(screen.getByRole("img", { name: "The whole island on the illustrated Guåhan map" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("The whole island of Guåhan.");
  expect(screen.getByRole("button", { name: "Whole island" })).toBeDisabled();
});

it("selects the art name, announces the change, retains focus and resets", async () => {
  const user = userEvent.setup();
  render(<VillageFinder />);
  const select = screen.getByRole("combobox", { name: "Choose a village" });
  await user.selectOptions(select, "hagatna");
  expect(select).toHaveFocus();
  expect(screen.getByRole("option", { name: "Hagåtña (Agana)" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Hagåtña on the Guåhan map.");
  expect(screen.getByRole("img", { name: "Hagåtña on the illustrated Guåhan map" })).toHaveAttribute("src", expect.stringContaining("hagatna-800.webp"));
  await user.click(screen.getByRole("button", { name: "Whole island" }));
  expect(select).toHaveValue("");
  expect(select).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent("The whole island of Guåhan.");
});

it("keeps the latest choice when selection changes before the crop loads", () => {
  render(<VillageFinder />);
  const select = screen.getByRole("combobox");
  fireEvent.change(select, { target: { value: "yigo" } });
  fireEvent.change(select, { target: { value: "malesso" } });
  expect(screen.queryByRole("img", { name: "Yigo on the illustrated Guåhan map" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Malesso' on the Guåhan map.");
});

it("waits for a successful image load and offers recovery when a crop fails", async () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<VillageFinder />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "yigo" } });
    const crop = screen.getByRole("img", { name: "Yigo on the illustrated Guåhan map" });
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('[data-ready="true"]')).toBeNull();
    fireEvent.error(crop);
    expect(screen.getByText("The detailed image couldn’t load.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.load(screen.getByRole("img", { name: "Yigo on the illustrated Guåhan map" }));
    expect(container.querySelector('[data-ready="true"]')).not.toBeNull();
    expect(screen.queryByText("The detailed image couldn’t load.")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
