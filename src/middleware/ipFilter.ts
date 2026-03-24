import type { NextFunction, Request, RequestHandler, Response } from "express";
import { TtlCache } from "../utils/cache";

type IpInfoResponse = {
  country?: string;
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const geoCache = new TtlCache<string, string | null>(ONE_HOUR_MS);
let hasWarnedMissingIpInfoToken = false;

const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0]?.trim() ?? req.ip ?? "unknown";
  }

  return req.ip ?? "unknown";
};

const normalizeIp = (ip: string): string => {
  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }

  return ip;
};

const parseCsvEnvToSet = (value: string | undefined, uppercase = false): Set<string> => {
  if (!value) {
    return new Set<string>();
  }

  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => (uppercase ? entry.toUpperCase() : entry)),
  );
};

const warnSecurityEvent = (req: Request, reason: string): void => {
  console.warn({
    timestamp: new Date().toISOString(),
    ip: normalizeIp(getClientIp(req)),
    reason,
    path: req.path,
  });
};

const lookupCountryCode = async (ip: string, token: string): Promise<string | null> => {
  const normalizedIp = normalizeIp(ip);
  const cachedCountry = geoCache.get(normalizedIp);

  if (cachedCountry !== undefined) {
    return cachedCountry;
  }

  const response = await fetch(`https://ipinfo.io/${encodeURIComponent(normalizedIp)}/json?token=${token}`);

  if (!response.ok) {
    throw new Error(`ipinfo lookup failed with status ${response.status}`);
  }

  const data = (await response.json()) as IpInfoResponse;
  const countryCode = data.country?.toUpperCase() ?? null;
  geoCache.set(normalizedIp, countryCode);

  return countryCode;
};

export const ipFilterMiddleware: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ip = normalizeIp(getClientIp(req));
    const blockedIps = parseCsvEnvToSet(process.env.BLOCKED_IPS);

    if (blockedIps.has(ip)) {
      warnSecurityEvent(req, "blocked_ip");
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const blockedCountries = parseCsvEnvToSet(process.env.BLOCKED_COUNTRIES, true);

    if (blockedCountries.size === 0) {
      next();
      return;
    }

    const ipInfoToken = process.env.IPINFO_TOKEN;

    if (!ipInfoToken) {
      if (!hasWarnedMissingIpInfoToken) {
        console.warn("[security] IPINFO_TOKEN is not set, skipping geo lookup (fail-open)");
        hasWarnedMissingIpInfoToken = true;
      }

      next();
      return;
    }

    const country = await lookupCountryCode(ip, ipInfoToken);

    if (country && blockedCountries.has(country)) {
      warnSecurityEvent(req, "blocked_country");
      res.status(403).json({ error: "Access denied" });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
