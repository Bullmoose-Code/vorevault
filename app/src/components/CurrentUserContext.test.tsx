// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CurrentUserProvider, useCurrentUser } from "./CurrentUserContext";

function Probe() {
  const user = useCurrentUser();
  return <div data-testid="probe">{user.id}|{user.isAdmin ? "admin" : "member"}</div>;
}

describe("CurrentUserContext", () => {
  it("provides id and isAdmin to descendants", () => {
    render(
      <CurrentUserProvider value={{ id: "u-42", isAdmin: true }}>
        <Probe />
      </CurrentUserProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("u-42|admin");
  });

  it("throws when used outside a provider", () => {
    const err = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Probe />)).toThrow(/CurrentUserProvider/);
    } finally {
      console.error = err;
    }
  });
});
