import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./mocks/server";
import { configureMocks } from "./mocks/handlers";
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  configureMocks();
  localStorage.clear();
  sessionStorage.clear();
});
afterAll(() => server.close());
