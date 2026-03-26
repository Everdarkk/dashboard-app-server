import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../botDetection";

describe("verifyTurnstile", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    delete process.env.TURNSTILE_SECRET;
  });

  it("returns true when Turnstile verification succeeds", async () => {
    process.env.TURNSTILE_SECRET = "test-secret";

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await verifyTurnstile("token", "1.2.3.4");
    expect(result).toBe(true);
  });

  it("returns false when Turnstile verification fails", async () => {
    process.env.TURNSTILE_SECRET = "test-secret";

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await verifyTurnstile("token", "1.2.3.4");
    expect(result).toBe(false);
  });
});
