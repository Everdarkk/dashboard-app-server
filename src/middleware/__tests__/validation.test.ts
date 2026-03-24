import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sanitizeBody, validate } from "../validation";

describe("validate", () => {
  const schema = z.object({
    name: z.string().min(1),
  });

  it("passes when body, query and params satisfy schema", async () => {
    const app = express();
    app.use(express.json());
    app.post("/items/:name", validate(schema), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    await request(app)
      .post("/items/value?name=query")
      .send({ name: "body" })
      .expect(200);
  });

  it("returns 400 with formatted errors when validation fails", async () => {
    const app = express();
    app.use(express.json());
    app.post("/items/:name", validate(schema), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app)
      .post("/items/value")
      .send({ name: "" })
      .expect(400);

    expect(response.body).toHaveProperty("errors");
  });
});

describe("sanitizeBody", () => {
  it("strips prototype pollution keys and oversized fields", async () => {
    process.env.MAX_FIELD_LENGTH = "10";

    const app = express();
    app.use(express.json());
    app.post("/sanitize", sanitizeBody, (req, res) => {
      res.status(200).json(req.body);
    });

    const payload = JSON.parse(
      '{"safe":"ok","__proto__":{"polluted":true},"constructor":"bad","prototype":"bad","tooLong":"12345678901"}',
    ) as Record<string, unknown>;

    const response = await request(app).post("/sanitize").send(payload).expect(200);

    expect(response.body).toEqual({ safe: "ok" });
  });
});
