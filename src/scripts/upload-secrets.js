#!/usr/bin/env node

// src/scripts/upload-secrets.js

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

// List the env vars you want to push
const secretKeys = [
  "AZURE_FUNCTION_URL",
  "OPENAI_API_KEY",
  "GROK_API_KEY",
  "GROK_BASE_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "NEXTAUTH_SECRET",
  "CF_API_TOKEN",
  "TURSO_URL",
  "TURSO_AUTH_TOKEN",
];

for (const key of secretKeys) {
  const val = process.env[key];
  if (!val) {
    console.warn(`⚠️  ${key} is not set in .env.local, skipping`);
    continue;
  }
  console.log(`Uploading secret ${key}…`);
  // Use printf to avoid shell‐escaping headaches
  execSync(
    `printf %s '${val.replace(/'/g, "'\\\\''")}' | wrangler secret put ${key}`,
    { stdio: "inherit" }
  );
}
