import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sanitizeBody, validate } from "../validation";

describe("validate", () => {
  const bodySchema = z.object({
    name: z.string().trim().transform((value) => value.toUpperCase()),
  });

  it("passes when only body schema is provided and applies transformed body", async () => {
    const app = express();
    app.use(express.json());
    app.post("/items", validate({ body: bodySchema }), (req, res) => {
      res.status(200).json({ body: req.body });
    });

    const response = await request(app).post("/items").send({ name: " body " }).expect(200);

    expect(response.body).toEqual({ body: { name: "BODY" } });
  });

  it("validates and applies coerced query and params data independently", async () => {
    const app = express();
    app.use(express.json());
    app.get(
      "/items/:id",
      validate({
        query: z.object({ page: z.coerce.number().int().min(1) }),
        params: z.object({ id: z.coerce.number().int().positive() }),
      }),
      (req, res) => {
        res.status(200).json({
          query: req.query,
          params: req.params,
        });
      },
    );

    const response = await request(app).get("/items/42?page=2").expect(200);

    expect(response.body).toEqual({
      query: { page: 2 },
      params: { id: 42 },
    });
  });

  it("returns 400 with formatted errors for provided invalid schema sections", async () => {
    const app = express();
    app.use(express.json());
    app.post("/items", validate({ body: z.object({ name: z.string().min(1) }) }), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).post("/items").send({ name: "" }).expect(400);

    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors).toHaveProperty("body");
    expect(response.body.errors).not.toHaveProperty("query");
    expect(response.body.errors).not.toHaveProperty("params");
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
