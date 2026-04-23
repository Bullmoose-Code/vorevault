// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemActionProvider, useItemActions } from "./ItemActionProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function OpenRename({ onSaved }: { onSaved: (v: string) => void }) {
  const actions = useItemActions();
  return (
    <button
      onClick={() =>
        actions.openRename({ kind: "file", id: "f1", currentName: "old.txt" }, async (v) => {
          onSaved(v);
        })
      }
    >
      trigger-rename
    </button>
  );
}

describe("ItemActionProvider", () => {
  it("openRename shows the rename dialog and calls the onSave callback with the new name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <ItemActionProvider>
        <OpenRename onSaved={onSaved} />
      </ItemActionProvider>,
    );
    await user.click(screen.getByText("trigger-rename"));
    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.type(input, "new.txt");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSaved).toHaveBeenCalledWith("new.txt");
  });

  it("showToast renders the message and dismisses after 3s", () => {
    vi.useFakeTimers();
    function Poke() {
      const { showToast } = useItemActions();
      return <button onClick={() => showToast({ message: "hello", variant: "info" })}>poke</button>;
    }
    render(
      <ItemActionProvider>
        <Poke />
      </ItemActionProvider>,
    );
    act(() => { screen.getByText("poke").click(); });
    expect(screen.getByText("hello")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByText("hello")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
