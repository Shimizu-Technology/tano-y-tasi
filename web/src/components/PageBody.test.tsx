import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PageBody } from "./PageBody";

const show = (body: string) => render(<MemoryRouter><PageBody body={body} /></MemoryRouter>);

it("renders headings, lists, bold, internal links and email addresses", () => {
  show("Intro line\nwraps here.\n\n## Heading\n\n- **One:** first\n- Two\n\nSee [returns](/info/returns) or a@b.com.");
  expect(screen.getByText("Intro line wraps here.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Heading" })).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByText("One:").tagName).toBe("STRONG");
  expect(screen.getByRole("link", { name: "returns" })).toHaveAttribute("href", "/info/returns");
  expect(screen.getByRole("link", { name: "a@b.com" })).toHaveAttribute("href", "mailto:a@b.com");
});

it("never renders typed markup or unsafe links", () => {
  const { container } = show("<img src=x onerror=alert(1)> [click](javascript:alert(1))");
  expect(container.querySelector("img")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  expect(container).toHaveTextContent("<img src=x onerror=alert(1)> click");
});
