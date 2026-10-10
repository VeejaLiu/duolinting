import { mkdir, writeFile, rename } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const { open } = createRequire(new URL("../backend/package.json", import.meta.url))("maxmind");

// Country-only DB-IP Lite, CC BY 4.0. Admin links to DB-IP wherever this
// provider's country results appear. The file is runtime data under ignored
// temp/geoip; it must never be copied into a release or application image.
const month = process.argv[2] ?? new Date().toISOString().slice(0, 7);
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Use YYYY-MM for the published DB-IP release");
const response = await fetch(`https://download.db-ip.com/free/dbip-country-lite-${month}.mmdb.gz`, { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`Country database download failed (${response.status})`);
const archive = Buffer.from(await response.arrayBuffer());
const database = gunzipSync(archive);
const expectedSha1 = process.argv[3];
// The publisher's checksum describes the decompressed MMDB, not its gzip envelope.
if (expectedSha1 && createHash("sha1").update(database).digest("hex") !== expectedSha1) throw new Error("Country database checksum differs from the publisher");
await mkdir("temp/geoip", { recursive: true });
const temporary = "temp/geoip/dbip-country-lite.mmdb.pending";
await writeFile(temporary, database);
const reader = await open(temporary);
if (!reader.metadata.databaseType || !reader.get("8.8.8.8")?.country?.iso_code) throw new Error("Country database validation failed");
await rename(temporary, "temp/geoip/dbip-country-lite.mmdb");
await writeFile("temp/geoip/ATTRIBUTION.txt", `IP Geolocation by DB-IP (https://db-ip.com), release ${month}.\nCreative Commons Attribution 4.0: https://creativecommons.org/licenses/by/4.0/\n`);
console.log(`Country database ${month} validated and prepared under ignored temp/geoip. No server was changed.`);
