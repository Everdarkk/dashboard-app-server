import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "../cache";

describe("TtlCache", () => {
  it("removes expired values on access", () => {
    vi.useFakeTimers();

    const cache = new TtlCache<string, string>(1_000, 10);

    cache.set("a", "value");
    expect(cache.get("a")).toBe("value");

    vi.advanceTimersByTime(1_100);

    expect(cache.get("a")).toBeUndefined();
    vi.useRealTimers();
  });

  it("evicts oldest entry when max size is reached", () => {
    const cache = new TtlCache<string, string>(60_000, 2);

    cache.set("first", "1");
    cache.set("second", "2");
    cache.set("third", "3");

    expect(cache.get("first")).toBeUndefined();
    expect(cache.get("second")).toBe("2");
    expect(cache.get("third")).toBe("3");
  });
});
