import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * No incremental cache, no tag cache, no queue: every route in this app is a
 * client component that fetches from the API at runtime, so there is no ISR
 * output to cache and nothing to revalidate.
 */
export default defineCloudflareConfig();
