import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHold, HOLD_MS } from "@/ui/hold";

describe("hold to confirm", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("confirms only after the full hold", () => {
    const confirm = vi.fn();
    const hold = createHold(confirm);
    hold.start();
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(confirm).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(hold.holding).toBe(false);
  });

  it("a release, leave or blur before the end cancels it", () => {
    const confirm = vi.fn();
    const hold = createHold(confirm);
    hold.start();
    vi.advanceTimersByTime(HOLD_MS - 100);
    hold.cancel();
    vi.advanceTimersByTime(1_000);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("a second press while holding does not restart or double the timer", () => {
    const confirm = vi.fn();
    const hold = createHold(confirm);
    hold.start();
    vi.advanceTimersByTime(500);
    hold.start();
    vi.advanceTimersByTime(300);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
