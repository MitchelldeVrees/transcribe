// open-next.config.ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // you can pass R2 or KV caching here if you want, e.g.
  // incrementalCache: r2IncrementalCache(),
});
