import pg from "pg";
const { Client } = pg;

const client = new Client({
  host: "db.jrsydiofzceoeddjogov.supabase.co",
  port: 5432,
  user: "postgres",
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

async function apply() {
  await client.connect();
  console.log("Connected to Supabase PostgreSQL database");

  // Helper to store secret in vault
  async function storeSecret(name, value, description) {
    if (!value || typeof value !== "string" || !value.trim()) return null;
    const res = await client.query(
      "SELECT vault.create_secret($1, $2, $3) as sid",
      [value.trim(), name, description]
    );
    return res.rows[0]?.sid || null;
  }

  // 1. Hologram (KV setting + Vault provider credential)
  const hologramApiKey = process.env.HOLOGRAM_API_KEY;
  const hologramOrgId = process.env.HOLOGRAM_ORG_ID;
  if (hologramApiKey && hologramOrgId) {
    await client.query(`
      INSERT INTO public.platform_kv_settings (key, value, updated_at)
      VALUES (
        'hologram_config',
        $1::jsonb,
        NOW()
      )
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW();
    `, [JSON.stringify({ org_id: hologramOrgId, base_url: "https://dashboard.hologram.io/api/1" })]);
    console.log("✓ Applied hologram_config to platform_kv_settings");

    const v_id = (await client.query("SELECT gen_random_uuid() as id")).rows[0].id;
    const keySid = await storeSecret(`hologram_api_key_${v_id}`, hologramApiKey, "Hologram API Key");
    const orgSid = await storeSecret(`hologram_org_id_${v_id}`, hologramOrgId, "Hologram Org ID");

    await client.query("UPDATE public.provider_credential_versions SET status = 'retired' WHERE provider = 'hologram' AND status = 'active'");
    const maskedKey = hologramApiKey.slice(0, 4) + "••••••••" + hologramApiKey.slice(-4);
    await client.query(`
      INSERT INTO public.provider_credential_versions (id, provider, masked, vault_ids, status, notes)
      VALUES ($1, 'hologram', $2, $3, 'active', 'Applied from AI Studio secrets')
    `, [
      v_id,
      JSON.stringify({ api_key: maskedKey, org_id: hologramOrgId }),
      JSON.stringify({ api_key: keySid, org_id: orgSid }),
    ]);
    console.log("✓ Stored Hologram credentials in Supabase Vault and provider_credential_versions");
  }

  // 2. Traccar
  const traccarToken = process.env.TRACCAR_API_TOKEN || process.env.TRACCAR_API_KEY;
  const traccarUrl = process.env.TRACCAR_BASE_URL || "https://www.traccar.org/my-account/Rentmaikar";
  const traccarEmail = process.env.TRACCAR_EMAIL;
  const traccarPassword = process.env.TRACCAR_PASSWORD;
  const traccarVapid = process.env.TRACCAR_VAPID_KEY;
  if (traccarToken || traccarPassword) {
    await client.query(`
      INSERT INTO public.platform_kv_settings (key, value, updated_at)
      VALUES (
        'traccar_config',
        $1::jsonb,
        NOW()
      )
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW();
    `, [JSON.stringify({ base_url: traccarUrl, api_url: traccarUrl, email: traccarEmail })]);
    console.log("✓ Applied traccar_config to platform_kv_settings");

    const v_id = (await client.query("SELECT gen_random_uuid() as id")).rows[0].id;
    const tokenSid = traccarToken ? await storeSecret(`traccar_token_${v_id}`, traccarToken, "Traccar API Token") : null;
    const passSid = traccarPassword ? await storeSecret(`traccar_pass_${v_id}`, traccarPassword, "Traccar Password") : null;
    const vapidSid = traccarVapid ? await storeSecret(`traccar_vapid_${v_id}`, traccarVapid, "Traccar VAPID Key") : null;

    await client.query("UPDATE public.provider_credential_versions SET status = 'retired' WHERE provider = 'traccar' AND status = 'active'");
    const vaultObj = {};
    const maskedObj = { base_url: traccarUrl, email: traccarEmail };
    if (tokenSid) { vaultObj.token = tokenSid; maskedObj.token = "••••••••"; }
    if (passSid) { vaultObj.password = passSid; maskedObj.password = "••••••••"; }
    if (vapidSid) { vaultObj.vapid_key = vapidSid; maskedObj.vapid_key = "••••••••"; }

    await client.query(`
      INSERT INTO public.provider_credential_versions (id, provider, masked, vault_ids, status, notes)
      VALUES ($1, 'traccar', $2, $3, 'active', 'Applied from AI Studio secrets')
    `, [
      v_id,
      JSON.stringify(maskedObj),
      JSON.stringify(vaultObj),
    ]);
    console.log("✓ Stored Traccar credentials in Supabase Vault and provider_credential_versions");
  }

  // 3. PayPal
  const paypalClientId = process.env.PAYPAL_CLIENT_ID;
  const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const paypalMode = process.env.PAYPAL_MODE || "LIVE";
  if (paypalClientId && paypalClientSecret) {
    await client.query(`
      INSERT INTO public.platform_kv_settings (key, value, updated_at)
      VALUES (
        'paypal_config',
        $1::jsonb,
        NOW()
      )
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW();
    `, [JSON.stringify({ client_id: paypalClientId, mode: paypalMode })]);
    console.log("✓ Applied paypal_config to platform_kv_settings");
  }

  // 4. Persona (Ensure webhook secret and environment ID are recorded in KV)
  const personaEnvId = process.env.PERSONA_ENVIRONMENT_ID;
  const personaWebhookSecret = process.env.PERSONA_WEBHOOK_SECRET;
  if (personaEnvId || personaWebhookSecret) {
    const existing = await client.query("SELECT value FROM public.platform_kv_settings WHERE key = 'persona_verification'");
    const currentVal = existing.rows[0]?.value || { enabled: false };
    const updatedVal = {
      ...currentVal,
      environment_id: personaEnvId || currentVal.environment_id,
      webhook_configured: Boolean(personaWebhookSecret),
    };
    await client.query(`
      INSERT INTO public.platform_kv_settings (key, value, updated_at)
      VALUES (
        'persona_verification',
        $1::jsonb,
        NOW()
      )
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW();
    `, [JSON.stringify(updatedVal)]);
    console.log("✓ Updated persona_verification in platform_kv_settings");
  }

  // 5. EMQX Management Config
  const emqxUrl = process.env.EMQX_API_URL;
  const emqxKey = process.env.EMQX_API_KEY;
  if (emqxUrl && emqxKey) {
    await client.query(`
      INSERT INTO public.platform_kv_settings (key, value, updated_at)
      VALUES (
        'emqx_management_config',
        $1::jsonb,
        NOW()
      )
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW();
    `, [JSON.stringify({ api_url: emqxUrl, api_key: emqxKey, configured: true })]);
    console.log("✓ Updated emqx_management_config in platform_kv_settings");
  }

  // Verify stored versions
  const versions = await client.query("SELECT provider, status, masked, created_at FROM public.provider_credential_versions WHERE status = 'active'");
  console.log("Active credential versions in DB:", versions.rows);

  await client.end();
  console.log("All secrets successfully applied to Supabase!");
}

apply().catch((err) => {
  console.error("Error applying secrets:", err);
  process.exit(1);
});
