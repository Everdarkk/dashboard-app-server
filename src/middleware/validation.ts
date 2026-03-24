import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodFormattedError, ZodSchema } from "zod";

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const REMOVE_VALUE = Symbol("remove");

type SanitizedValue = unknown | typeof REMOVE_VALUE;

type ValidationErrorBag = {
  body?: ZodFormattedError<unknown>;
  query?: ZodFormattedError<unknown>;
  params?: ZodFormattedError<unknown>;
};

const getMaxFieldLength = (): number => {
  const rawValue = process.env.MAX_FIELD_LENGTH;
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 10_000;
  }

  return parsedValue;
};

const sanitizeValue = (value: unknown, maxFieldLength: number): SanitizedValue => {
  if (typeof value === "string") {
    if (value.length > maxFieldLength) {
      return REMOVE_VALUE;
    }

    return value;
  }

  if (Array.isArray(value)) {
    const sanitizedArray = value
      .map((entry) => sanitizeValue(entry, maxFieldLength))
      .filter((entry) => entry !== REMOVE_VALUE);

    return sanitizedArray;
  }

  if (value !== null && typeof value === "object") {
    const sanitizedObject: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key)) {
        continue;
      }

      const sanitizedEntry = sanitizeValue(entry, maxFieldLength);

      if (sanitizedEntry === REMOVE_VALUE) {
        continue;
      }

      sanitizedObject[key] = sanitizedEntry;
    }

    return sanitizedObject;
  }

  return value;
};

export const sanitizeBody: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const maxFieldLength = getMaxFieldLength();
    const sanitizedBody = sanitizeValue(req.body, maxFieldLength);

    if (sanitizedBody === REMOVE_VALUE) {
      req.body = {};
      next();
      return;
    }

    req.body = sanitizedBody;
    next();
  } catch (error) {
    next(error);
  }
};

export const validate = (schema: ZodSchema<unknown>): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const bodyResult = schema.safeParse(req.body);
      const queryResult = schema.safeParse(req.query);
      const paramsResult = schema.safeParse(req.params);

      const errors: ValidationErrorBag = {};

      if (!bodyResult.success) {
        errors.body = bodyResult.error.format();
      }

      if (!queryResult.success) {
        errors.query = queryResult.error.format();
      }

      if (!paramsResult.success) {
        errors.params = paramsResult.error.format();
      }

      if (Object.keys(errors).length > 0) {
        res.status(400).json({ errors });
        return;
      }

      req.body = bodyResult.data;

      next();
    } catch (error) {
      next(error);
    }
  };
};
