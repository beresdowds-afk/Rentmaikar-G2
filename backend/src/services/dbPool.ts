import { Pool } from "pg";
import { databaseLifecycle, manageDatabasePool } from "./databaseLifecycle";

let pool: Pool | null = null;
let poolClosePromise: Promise<void> | null = null;

export function getDbPool(): Pool {
  databaseLifecycle.assertAccessAllowed();
  if (poolClosePromise) {
    throw new Error("Application database pool is closing or closed");
  }
  if (!pool) {
    const host = process.env.SUPABASE_DB_HOST || "db.jrsydiofzceoeddjogov.supabase.co";
    const port = Number(process.env.SUPABASE_DB_PORT) || 5432;
    const user = process.env.SUPABASE_DB_USER || "postgres";
    const password = process.env.SUPABASE_DB_PASSWORD || "";
    const database = process.env.SUPABASE_DB_NAME || "postgres";

    pool = manageDatabasePool(new Pool({
      host,
      port,
      user,
      password,
      database,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    }), "application database");

    pool.on("error", (err) => {
      console.error("[Database Pool Error]:", err.message);
    });
  }

  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (poolClosePromise) return poolClosePromise;
  if (!pool) return;
  const initializedPool = pool;
  poolClosePromise = (async () => {
    await databaseLifecycle.waitForIdle();
    await initializedPool.end();
    if (pool === initializedPool) pool = null;
  })();
  return poolClosePromise;
}
