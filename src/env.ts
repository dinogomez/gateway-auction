import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables
   * These are only available on the server and won't be bundled into the client
   */
  server: {
    CONVEX_DEPLOYMENT: z.string().optional(),
    AI_GATEWAY_API_KEY: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Client-side environment variables
   * These must be prefixed with NEXT_PUBLIC_ and are available in the browser
   */
  client: {
    NEXT_PUBLIC_CONVEX_URL: z.string().url(),
    // Dev mode flag - enables dev games, admin page, etc.
    // Set to "true" to enable dev features in any environment
    NEXT_PUBLIC_DEV_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((val) => val === "true"),
  },

  /**
   * Runtime environment mapping
   * Required to explicitly include variables in the bundle
   */
  runtimeEnv: {
    // Server
    CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    // Client
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_DEV_MODE: process.env.NEXT_PUBLIC_DEV_MODE,
  },

  /**
   * Skip validation in certain environments (e.g., Docker builds)
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Makes it so that empty strings are treated as undefined
   */
  emptyStringAsUndefined: true,
});

/**
 * Helper to check if dev mode is enabled
 * Dev mode is enabled if NEXT_PUBLIC_DEV_MODE=true OR NODE_ENV=development
 */
export const isDevMode = () => {
  // In client components, we can only check NEXT_PUBLIC_DEV_MODE
  if (typeof window !== "undefined") {
    return env.NEXT_PUBLIC_DEV_MODE;
  }
  // On server, also allow NODE_ENV=development as fallback
  return env.NEXT_PUBLIC_DEV_MODE || env.NODE_ENV === "development";
};
