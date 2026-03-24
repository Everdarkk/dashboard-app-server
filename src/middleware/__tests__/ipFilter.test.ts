import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ipFilterMiddleware } from "../ipFilter";

describe("ipFilterMiddleware", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    delete process.env.BLOCKED_IPS;
    delete process.env.BLOCKED_COUNTRIES;
    delete process.env.IPINFO_TOKEN;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("blocks requests from blocked IPs", async () => {
    process.env.BLOCKED_IPS = "1.2.3.4";

    const app = express();
    app.set("trust proxy", true);
    app.use(ipFilterMiddleware);
    app.get("/", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app)
      .get("/")
      .set("x-forwarded-for", "1.2.3.4")
      .expect(403);

    expect(response.body).toEqual({ error: "Access denied" });
  });

  it("blocks requests from blocked countries", async () => {
    process.env.BLOCKED_COUNTRIES = "RU";
    process.env.IPINFO_TOKEN = "token";

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ country: "RU" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const app = express();
    app.set("trust proxy", true);
    app.use(ipFilterMiddleware);
    app.get("/", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    await request(app).get("/").set("x-forwarded-for", "5.6.7.8").expect(403);
  });

  it("allows requests from non-blocked IPs and countries", async () => {
    process.env.BLOCKED_IPS = "1.2.3.4";
    process.env.BLOCKED_COUNTRIES = "RU";
    process.env.IPINFO_TOKEN = "token";

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ country: "US" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const app = express();
    app.set("trust proxy", true);
    app.use(ipFilterMiddleware);
    app.get("/", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app)
      .get("/")
      .set("x-forwarded-for", "9.9.9.9")
      .expect(200);

    expect(response.body).toEqual({ ok: true });
  });
});
