import "./load-env.js";

import { betterAuth } from "better-auth";
import { Pool } from "pg";

import { table } from "./db.js";

if (!process.env.INV_DATABASE_URL) {
  throw new Error("Missing INV_DATABASE_URL for Supabase Postgres connection.");
}

const pool = new Pool({
  connectionString: process.env.INV_DATABASE_URL,
  ssl:
    process.env.INV_DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

const isDev = process.env.NODE_ENV !== "production";

export const auth = betterAuth({
  database: pool,
  appName: "Vibed",
  baseURL: process.env.INV_BETTER_AUTH_URL,
  secret: process.env.INV_BETTER_AUTH_SECRET,
  trustedOrigins: isDev
    ? ["*"]
    : [process.env.INV_CLIENT_URL ?? "http://localhost:3000"],
  user: {
    modelName: table("user"),
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "guest",
        required: false,
      },
    },

  },
  session: {
    modelName: table("session"),
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  account: {
    modelName: table("account"),
  },
  verification: {
    modelName: table("verification"),
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
  },
  advanced: {
    cookiePrefix: 'dth_inv',
    ...(isDev
      ? {
        disableOriginCheck: true,
        disableCSRFCheck: true,
      }
      : {}),
  },
});
