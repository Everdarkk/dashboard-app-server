import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "../rateLimit";

describe("createRateLimiter", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("limits requests within a window and allows again after window reset", async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 1_000, max: 2 }));
    app.get("/", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    await request(app).get("/").expect(200);
    await request(app).get("/").expect(200);

    const blockedResponse = await request(app).get("/").expect(429);
    expect(blockedResponse.body).toMatchObject({
      error: "Too many requests",
    });

    vi.advanceTimersByTime(1_100);

    await request(app).get("/").expect(200);
  });
});
