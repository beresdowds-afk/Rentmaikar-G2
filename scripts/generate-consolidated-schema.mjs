import fs from 'fs';
import path from 'path';

const migrationsDir = path.resolve('supabase/migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

console.log(`Found ${files.length} migration files.`);

const header = `-- ==============================================================================
-- Rentmaikar Consolidated Database Schema
-- Generated for Supabase Project: jrsydiofzceoeddjogov (Rentmaikar)
-- Total Migrations Bundled: ${files.length}
-- ==============================================================================

-- Enable standard Supabase extensions safely
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pgcrypto; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pg_cron; EXCEPTION WHEN OTHERS THEN NULL; END $$;

`;

let outputContent = header;

files.forEach((file, idx) => {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  outputContent += `\n-- ==============================================================================\n`;
  outputContent += `-- [${idx + 1}/${files.length}] Migration: ${file}\n`;
  outputContent += `-- ==============================================================================\n\n`;
  outputContent += content + '\n';
});

const outFile = path.resolve('supabase/consolidated_schema.sql');
fs.writeFileSync(outFile, outputContent, 'utf8');
console.log(`Consolidated schema written to ${outFile} (${(outputContent.length / 1024 / 1024).toFixed(2)} MB).`);
