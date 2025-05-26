// src/lib/turso.ts
import { createClient, Client } from '@libsql/client/web'

let client: Client

/**  
 * Lazily build (and cache) a Turso client pointing at your Cloudflare-provided DB.  
 */
export function getTursoClient(): Client {
  if (!client) {
    const url = process.env.TURSO_URL?.trim()
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim()
    if (!url || !authToken) {
      throw new Error('Missing TURSO_URL or TURSO_AUTH_TOKEN')
    }
    client = createClient({ url, authToken })
  }
  return client
}
