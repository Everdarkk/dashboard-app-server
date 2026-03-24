import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySecurity, authMiddleware } from "../security";

type EnvSnapshot = {
  NODE_ENV?: string;
  BLOCKED_IPS?: string;
  BLOCKED_COUNTRIES?: string;
  IPINFO_TOKEN?: string;
  TURNSTILE_SECRET?: string;
  HONEYPOT_FIELD?: string;
  MAX_FIELD_LENGTH?: string;
};

const snapshotEnv = (): EnvSnapshot => ({
  NODE_ENV: process.env.NODE_ENV,
  BLOCKED_IPS: process.env.BLOCKED_IPS,
  BLOCKED_COUNTRIES: process.env.BLOCKED_COUNTRIES,
  IPINFO_TOKEN: process.env.IPINFO_TOKEN,
  TURNSTILE_SECRET: process.env.TURNSTILE_SECRET,
  HONEYPOT_FIELD: process.env.HONEYPOT_FIELD,
  MAX_FIELD_LENGTH: process.env.MAX_FIELD_LENGTH,
});

const restoreEnv = (snapshot: EnvSnapshot): void => {
  const keys = Object.keys(snapshot) as Array<keyof EnvSnapshot>;

  for (const key of keys) {
    const value = snapshot[key];

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
};

const createTestApp = (): Express => {
  const app = express();

  app.set("trust proxy", true);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  applySecurity(app, {
    enableRateLimit: false,
  });

  app.post("/echo", (req, res) => {
    res.status(200).json({ body: req.body });
  });

  app.post("/auth/login", ...authMiddleware, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
};

describe("security middleware integration", () => {
  let envBeforeTest: EnvSnapshot;

  beforeEach(() => {
    envBeforeTest = snapshotEnv();

    delete process.env.BLOCKED_IPS;
    delete process.env.BLOCKED_COUNTRIES;
    delete process.env.IPINFO_TOKEN;
    delete process.env.TURNSTILE_SECRET;
    delete process.env.HONEYPOT_FIELD;
    process.env.MAX_FIELD_LENGTH = "10";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    restoreEnv(envBeforeTest);
    vi.restoreAllMocks();
  });

  it("applies security headers on responses", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/echo")
      .set("user-agent", "Mozilla/5.0")
      .send({ safe: "ok" })
      .expect(200);

    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("blocks blocked IPs before route handlers", async () => {
    process.env.BLOCKED_IPS = "1.2.3.4";

    const app = createTestApp();

    const response = await request(app)
      .post("/echo")
      .set("x-forwarded-for", "1.2.3.4")
      .set("user-agent", "Mozilla/5.0")
      .send({ safe: "ok" })
      .expect(403);

    expect(response.body).toEqual({ error: "Access denied" });
  });

  it("blocks suspicious user-agent in production", async () => {
    process.env.NODE_ENV = "production";

    const app = createTestApp();

    const response = await request(app)
      .post("/echo")
      .set("user-agent", "curl/8.7.1")
      .send({ safe: "ok" })
      .expect(403);

    expect(response.body).toEqual({ error: "Access denied" });
  });

  it("sanitizes request body by removing dangerous and oversized fields", async () => {
    const app = createTestApp();

    const payload = JSON.parse(
      '{"safe":"ok","__proto__":{"polluted":true},"constructor":"x","prototype":"x","tooLong":"12345678901"}',
    ) as Record<string, unknown>;

    const response = await request(app)
      .post("/echo")
      .set("user-agent", "Mozilla/5.0")
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({ body: { safe: "ok" } });
  });

  it("rejects auth route when turnstile token is missing", async () => {
    process.env.TURNSTILE_SECRET = "secret";

    const app = createTestApp();

    const response = await request(app)
      .post("/auth/login")
      .set("user-agent", "Mozilla/5.0")
      .send({ username: "test" })
      .expect(400);

    expect(response.body).toEqual({ error: "Turnstile token required" });
  });
});
