import { handlers } from "../../../../lib/nextAuth"

// App Router requires named exports:
export const { GET, POST } = handlers

// For Cloudflare Workers/Pages, this is usually correct:
