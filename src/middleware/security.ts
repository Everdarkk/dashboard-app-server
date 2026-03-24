import type { Express, RequestHandler } from "express";
import {
  honeypotMiddleware,
  userAgentMiddleware,
  verifyTurnstileMiddleware,
} from "./botDetection";
import { securityHeaders } from "./headers";
import { ipFilterMiddleware } from "./ipFilter";
import { authLimiter, defaultLimiter } from "./rateLimit";
import { sanitizeBody } from "./validation";
import type { SecurityOptions } from "../types/security";

const defaultOptions: Required<SecurityOptions> = {
  enableSecurityHeaders: true,
  enableIpFilter: true,
  enableBotDetection: true,
  enableRateLimit: true,
  enableBodySanitization: true,
};

export const applySecurity = (app: Express, options: SecurityOptions = {}): void => {
  applySecurityPreBody(app, options);
  applySecurityPostBody(app, options);
};

export const applySecurityPreBody = (app: Express, options: SecurityOptions = {}): void => {
  const resolvedOptions = { ...defaultOptions, ...options };

  if (resolvedOptions.enableSecurityHeaders) {
    app.use(securityHeaders);
  }

  if (resolvedOptions.enableIpFilter) {
    app.use(ipFilterMiddleware);
  }

  if (resolvedOptions.enableBotDetection) {
    app.use(userAgentMiddleware);
  }
};

export const applySecurityPostBody = (app: Express, options: SecurityOptions = {}): void => {
  const resolvedOptions = { ...defaultOptions, ...options };

  if (resolvedOptions.enableBotDetection) {
    app.use(honeypotMiddleware);
  }

  if (resolvedOptions.enableBodySanitization) {
    app.use(sanitizeBody);
  }
};

export const authMiddleware: RequestHandler[] = [authLimiter, verifyTurnstileMiddleware];

export { authLimiter, defaultLimiter };
