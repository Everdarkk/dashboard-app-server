import type { NextFunction, Request, RequestHandler, Response } from "express";

type TurnstileVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

const BOT_USER_AGENT_PATTERN =
  /(curl|wget|python-requests|axios|postmanruntime|insomnia|node-fetch|go-http-client|java|libwww-perl|httpclient)/i;

const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0]?.trim() ?? req.ip ?? "unknown";
  }

  return req.ip ?? "unknown";
};

const warnSecurityEvent = (req: Request, reason: string): void => {
  console.warn({
    timestamp: new Date().toISOString(),
    ip: getClientIp(req),
    reason,
    path: req.path,
  });
};

const isSuspiciousUserAgent = (userAgent: string | undefined): boolean => {
  if (!userAgent) {
    return true;
  }

  return BOT_USER_AGENT_PATTERN.test(userAgent);
};

const rejectSuspiciousUserAgent = (req: Request, res: Response): boolean => {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const userAgent = req.get("user-agent");

  if (!isSuspiciousUserAgent(userAgent ?? undefined)) {
    return false;
  }

  warnSecurityEvent(req, "suspicious_or_missing_user_agent");
  res.status(403).json({ error: "Access denied" });
  return true;
};

const hasTriggeredHoneypot = (req: Request): boolean => {
  const honeypotField = process.env.HONEYPOT_FIELD ?? "_hp";

  const isFilled = (value: unknown): boolean => {
    if (value === undefined || value === null) {
      return false;
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return true;
  };

  return isFilled(req.body?.[honeypotField]) || isFilled(req.query?.[honeypotField]);
};

export const honeypotMiddleware: RequestHandler = (req, res, next): void => {
  try {
    if (!hasTriggeredHoneypot(req)) {
      next();
      return;
    }

    warnSecurityEvent(req, "honeypot_triggered");
    res.status(403).json({ error: "Access denied" });
  } catch (error) {
    next(error);
  }
};

export const userAgentMiddleware: RequestHandler = (req, res, next): void => {
  try {
    if (rejectSuspiciousUserAgent(req, res)) {
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const verifyTurnstile = async (token: string, ip: string): Promise<boolean> => {
  const secret = process.env.TURNSTILE_SECRET;

  if (!secret) {
    console.warn("[security] TURNSTILE_SECRET is not set, skipping Turnstile verification");
    return true;
  }

  const params = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip,
  });

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    return false;
  }

  const result = (await response.json()) as TurnstileVerifyResponse;
  return result.success;
};

const getTurnstileToken = (req: Request): string | null => {
  const headerToken = req.get("x-turnstile-token");

  if (headerToken) {
    return headerToken;
  }

  const bodyToken =
    req.body?.["cf-turnstile-response"] ?? req.body?.turnstileToken ?? req.body?.turnstile;

  if (typeof bodyToken === "string" && bodyToken.length > 0) {
    return bodyToken;
  }

  return null;
};

export const verifyTurnstileMiddleware: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const secret = process.env.TURNSTILE_SECRET;

    if (!secret) {
      next();
      return;
    }

    const token = getTurnstileToken(req);

    if (!token) {
      warnSecurityEvent(req, "missing_turnstile_token");
      res.status(400).json({ error: "Turnstile token required" });
      return;
    }

    const ip = getClientIp(req);
    const isValid = await verifyTurnstile(token, ip);

    if (!isValid) {
      warnSecurityEvent(req, "failed_turnstile_verification");
      res.status(403).json({ error: "Access denied" });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const botDetectionMiddleware: RequestHandler = (req, res, next): void => {
  try {
    if (rejectSuspiciousUserAgent(req, res)) {
      return;
    }

    if (hasTriggeredHoneypot(req)) {
      warnSecurityEvent(req, "honeypot_triggered");
      res.status(403).json({ error: "Access denied" });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
