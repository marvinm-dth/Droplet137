import dotenv from "dotenv";

const nodeEnv = process.env.NODE_ENV ?? "development";

// Load most specific to least specific without overriding already set values.
const envFiles = [
  `.env.${nodeEnv}.local`,
  `.env.${nodeEnv}`,
  ".env.local",
  ".env",
];

for (const path of envFiles) {
  dotenv.config({ path, override: false });
}
