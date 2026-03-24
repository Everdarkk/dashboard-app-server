import rateLimit, {
  ipKeyGenerator,
  type RateLimitRequestHandler,
  type Options,
} from "express-rate-limit";
import { RedisStore, type SendCommandFn } from "rate-limit-redis";
import Redis from "ioredis";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let redisClient: Redis | null = null;

const getRedisStore = (): Options["store"] | undefined => {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return undefined;
  }

  try {
    if (!redisClient) {
      redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
      });
    }

    const sendCommand: SendCommandFn = async (...args: string[]) => {
      await redisClient?.connect();

      if (!redisClient) {
        return 0;
      }

      if (args.length === 0) {
        return 0;
      }

      const [command, ...commandArgs] = args;

      if (!command) {
        return 0;
      }

      const result = await redisClient.call(command, ...commandArgs);
      return result as Awaited<ReturnType<SendCommandFn>>;
    };

    return new RedisStore({ sendCommand });
  } catch (error) {
    console.warn("[security] Failed to initialize Redis rate limit store, falling back to in-memory store", error);
    return undefined;
  }
};

export type RateLimiterFactoryOptions = {
  windowMs?: number;
  max?: number;
  keyPrefix?: string;
};

export const createRateLimiter = ({
  windowMs = FIFTEEN_MINUTES_MS,
  max = 100,
  keyPrefix,
}: RateLimiterFactoryOptions = {}): RateLimitRequestHandler => {
  const store = getRedisStore();

  return rateLimit({
    windowMs,
    max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    ...(store ? { store } : {}),
    ...(keyPrefix ? { keyGenerator: (req) => `${keyPrefix}:${ipKeyGenerator(req.ip ?? "")}` } : {}),
    handler: (req, res) => {
      const retryAfterSeconds = Math.max(1, Math.ceil(windowMs / 1000));

      console.warn({
        timestamp: new Date().toISOString(),
        ip: req.ip,
        reason: "rate_limit_exceeded",
        path: req.path,
      });

      res.status(429).json({
        error: "Too many requests",
        retryAfter: retryAfterSeconds,
      });
    },
  });
};

export const defaultLimiter = createRateLimiter();
export const authLimiter = createRateLimiter({
  max: 10,
  windowMs: FIFTEEN_MINUTES_MS,
  keyPrefix: "auth",
});
