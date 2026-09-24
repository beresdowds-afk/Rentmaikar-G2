import { Pool } from "pg";

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const host = process.env.SUPABASE_DB_HOST || "db.jrsydiofzceoeddjogov.supabase.co";
    const port = Number(process.env.SUPABASE_DB_PORT) || 5432;
    const user = process.env.SUPABASE_DB_USER || "postgres";
    const password = process.env.SUPABASE_DB_PASSWORD || "";
    const database = process.env.SUPABASE_DB_NAME || "postgres";

    pool = new Pool({
      host,
      port,
      user,
      password,
      database,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });

    pool.on("error", (err) => {
      console.error("[Database Pool Error]:", err.message);
    });
  }

  return pool;
}
