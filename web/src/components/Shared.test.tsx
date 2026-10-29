import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Signup } from "./Shared";
it("confirms a saved signup and presents its completion message", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Signup />
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email for drop alerts"), "visitor@example.com");
  await user.click(screen.getByRole("button", { name: "SIGN UP" }));
  expect(await screen.findByRole("status")).toHaveTextContent("You’re on the list.");
});
