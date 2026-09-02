#!/usr/bin/env node

/**
 * Generate phone_reference seed data
 *
 * Usage:
 *    node scripts/gen_phone_seed.mjs
 */

import fs from "fs";
import path from "path";

import {
    getCountries,
    getCountryCallingCode,
    getExampleNumber
} from "libphonenumber-js";

import examples from "libphonenumber-js/examples.mobile.json.js";

const ACTIVE_REGIONS = new Set([
    "NG",
    "US"
]);

const displayNames = new Intl.DisplayNames(
    ["en"],
    { type: "region" }
);

const escapeSql = (value) => {

    if (value === null || value === undefined) {
        return "NULL";
    }

    return `'${String(value).replace(/'/g, "''")}'`;

};

const rows = [];

for (const iso of getCountries()) {

    const example = getExampleNumber(iso, examples);

    rows.push({

        iso2: iso,

        country_name:
            displayNames.of(iso) ?? iso,

        calling_code:
            "+" + getCountryCallingCode(iso),

        example_e164:
            example?.number ?? null,

        example_national:
            example?.formatNational() ?? null,

        example_international:
            example?.formatInternational() ?? null,

        example_digits:
            example?.nationalNumber ?? null,

        is_active_region:
            ACTIVE_REGIONS.has(iso),

        region_status:
            ACTIVE_REGIONS.has(iso)
                ? "ACTIVE"
                : "AVAILABLE",

        validation_library:
            "libphonenumber-js",

        supports_phone_validation:
            true

    });

}

rows.sort((a, b) =>
    a.country_name.localeCompare(b.country_name)
);

const values = rows.map(r => `(
${escapeSql(r.iso2)},
${escapeSql(r.country_name)},
${escapeSql(r.calling_code)},
${escapeSql(r.example_e164)},
${escapeSql(r.example_national)},
${escapeSql(r.example_international)},
${escapeSql(r.example_digits)},
${r.is_active_region},
${escapeSql(r.region_status)},
${escapeSql(r.validation_library)},
${r.supports_phone_validation}
)`);

const sql = `

INSERT INTO public.phone_reference (

iso2,
country_name,
calling_code,

example_e164,
example_national,
example_international,
example_digits,

is_active_region,
region_status,

validation_library,
supports_phone_validation

)

VALUES

${values.join(",\n")}

ON CONFLICT (iso2)

DO UPDATE SET

country_name=EXCLUDED.country_name,
calling_code=EXCLUDED.calling_code,

example_e164=EXCLUDED.example_e164,
example_national=EXCLUDED.example_national,
example_international=EXCLUDED.example_international,
example_digits=EXCLUDED.example_digits,

is_active_region=EXCLUDED.is_active_region,
region_status=EXCLUDED.region_status,

validation_library=EXCLUDED.validation_library,
supports_phone_validation=EXCLUDED.supports_phone_validation,

updated_at=NOW();

`;

const outDir = path.resolve("scripts/generated");

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

const outFile = path.join(
    outDir,
    "phone_reference_seed.sql"
);

fs.writeFileSync(outFile, sql);

console.log("");
console.log("-----------------------------------");
console.log("Phone Seed Generated Successfully");
console.log("-----------------------------------");
console.log(`Countries: ${rows.length}`);
console.log(`Active Regions: ${ACTIVE_REGIONS.size}`);
console.log(`Output: ${outFile}`);
console.log("");
