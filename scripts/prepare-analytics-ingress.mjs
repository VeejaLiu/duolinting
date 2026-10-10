import { isIP } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";

// Keep CDN trust files outside Git and images. Both files use the same official
// peer list: public ingress restores client IP only for those peers, and only
// those original peers may supply a country header. No visitor IP is uploaded.
const responses = await Promise.all(["v4", "v6"].map(async (family) => {
  const r = await fetch(`https://www.cloudflare.com/ips-${family}`, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Official CDN peer download failed (${r.status})`);
  return (await r.text()).trim().split(/\s+/);
}));
const ranges = responses.flat();
for (const range of ranges) {
  const [address, prefix, extra] = range.split("/");
  const version = isIP(address);
  if (!version || extra || !/^\d+$/.test(prefix ?? "") || Number(prefix) <= 0 || Number(prefix) > (version === 4 ? 32 : 128)) throw new Error("Invalid official CDN peer range");
}
if (!responses[0].length || !responses[1].length) throw new Error("Official CDN list is empty");
await mkdir("temp/nginx-analytics/real-ip", { recursive: true });
await mkdir("temp/nginx-analytics/cdn-peers", { recursive: true });
await writeFile("temp/nginx-analytics/real-ip/cloudflare.conf", ranges.map((range) => `set_real_ip_from ${range};`).join("\n") + "\nreal_ip_header CF-Connecting-IP;\nreal_ip_recursive on;\n");
await writeFile("temp/nginx-analytics/cdn-peers/cloudflare.conf", ranges.map((range) => `${range} 1;`).join("\n") + "\n");
console.log(`Prepared ${ranges.length} official CDN peer ranges under ignored temp/nginx-analytics. No server was changed.`);
