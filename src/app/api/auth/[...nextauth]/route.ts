// Re-export handlers from the root-level `auth.ts` (Auth.js v5 canonical setup)
import { handlers } from "../../../../../auth"

// App Router requires named exports:
export const { GET, POST } = handlers

// For Cloudflare Workers/Pages, this is usually correct:
