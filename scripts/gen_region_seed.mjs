#!/usr/bin/env node

/**
 * Generate initial RentMaikar regions
 *
 * Usage:
 *
 * node scripts/gen_region_seed.mjs
 */

import fs from "fs";
import path from "path";

const REGIONS = [

{
    iso2: "NG",
    region_code: "NIGERIA",
    region_name: "Nigeria",

    currency_code: "NGN",
    currency_symbol: "₦",

    timezone: "Africa/Lagos",

    locale: "en-NG",

    default_language: "en",

    registration_enabled: true,

    bookings_enabled: true,

    payments_enabled: true,

    verification_required: true,

    is_default: true,

    status: "ACTIVE"
},

{
    iso2: "US",
    region_code: "USA",
    region_name: "United States",

    currency_code: "USD",
    currency_symbol: "$",

    timezone: "America/New_York",

    locale: "en-US",

    default_language: "en",

    registration_enabled: true,

    bookings_enabled: true,

    payments_enabled: true,

    verification_required: true,

    is_default: false,

    status: "ACTIVE"
}

];

function sql(v) {

    if (v === null || v === undefined)
        return "NULL";

    if (typeof v === "boolean")
        return v ? "TRUE" : "FALSE";

    return `'${String(v).replace(/'/g, "''")}'`;

}

const values = REGIONS.map(r => `(

${sql(r.iso2)},
${sql(r.region_code)},
${sql(r.region_name)},

${sql(r.currency_code)},
${sql(r.currency_symbol)},

${sql(r.timezone)},
${sql(r.locale)},
${sql(r.default_language)},

${sql(r.registration_enabled)},
${sql(r.bookings_enabled)},
${sql(r.payments_enabled)},
${sql(r.verification_required)},

${sql(r.is_default)},
${sql(r.status)}

)`);

const seed = `

INSERT INTO public.regions (

iso2,

region_code,
region_name,

currency_code,
currency_symbol,

timezone,
locale,
default_language,

registration_enabled,
bookings_enabled,
payments_enabled,
verification_required,

is_default,
status

)

VALUES

${values.join(",\n")}

ON CONFLICT (iso2)

DO UPDATE SET

region_code=EXCLUDED.region_code,
region_name=EXCLUDED.region_name,

currency_code=EXCLUDED.currency_code,
currency_symbol=EXCLUDED.currency_symbol,

timezone=EXCLUDED.timezone,
locale=EXCLUDED.locale,
default_language=EXCLUDED.default_language,

registration_enabled=EXCLUDED.registration_enabled,
bookings_enabled=EXCLUDED.bookings_enabled,
payments_enabled=EXCLUDED.payments_enabled,
verification_required=EXCLUDED.verification_required,

is_default=EXCLUDED.is_default,
status=EXCLUDED.status,

updated_at=NOW();

`;

const outDir = path.resolve("scripts/generated");

fs.mkdirSync(outDir, {
    recursive: true
});

const outfile = path.join(
    outDir,
    "regions_seed.sql"
);

fs.writeFileSync(outfile, seed);

console.log("");
console.log("--------------------------------");
console.log("Region Seed Generated");
console.log("--------------------------------");
console.log(`Regions : ${REGIONS.length}`);
console.log(`Output  : ${outfile}`);
console.log("");
