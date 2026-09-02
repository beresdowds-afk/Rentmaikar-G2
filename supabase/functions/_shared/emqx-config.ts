// Admin-configurable EMQX management/monitoring endpoint resolution.
// Priority: platform_kv_settings row `emqx_management_config` -> env EMQX_* -> defaults.
// Nothing secret lives here: only hosts, ports and the API base path.

export interface EmqxManagementConfig {
  /** Fully-qualified management API base, e.g. https://host:8443/api/v5 */
  apiUrl: string;
  managementHost: string | null;
  managementPort: number | null;
  apiBasePath: string;
  /** MQTT broker connection (informational for the dashboard) */
  mqttHost: string | null;
  mqttPort: number | null;
  /** When false, the dashboard degrades gracefully instead of calling the API. */
  managementEnabled: boolean;
  deploymentType: "serverless" | "dedicated" | "self_hosted";
  source: "settings" | "env" | "default";
}

const DEFAULT_MANAGEMENT_PORT = 8443;
const DEFAULT_BASE_PATH = "/api/v5";
const DEFAULT_URL = `https://broker.rentmaikar.com:${DEFAULT_MANAGEMENT_PORT}${DEFAULT_BASE_PATH}`;

/** Console/dashboard ports that never serve the management API on hosted plans. */
const CONSOLE_PORTS = new Set([18083, 443, 80]);

function buildUrl(host?: string | null, port?: number | null, basePath?: string | null): string | null {
  if (!host) return null;
  const clean = String(host).replace(/^https?:\/\//, "").replace(/\/$/, "");
  const path = (basePath || DEFAULT_BASE_PATH).startsWith("/") ? basePath || DEFAULT_BASE_PATH : `/${basePath}`;
  return `https://${clean}${port ? `:${port}` : ""}${path}`;
}

/**
 * Force a deployment-specific management endpoint: port 8443 with an /api/v5 base path.
 * Hosted (serverless/dedicated) deployments expose the management API there, not on the
 * console host/port. Self-hosted deployments are left untouched.
 */
function toDeploymentEndpoint(
  rawUrl: string,
  deploymentType: EmqxManagementConfig["deploymentType"],
  basePath: string,
): string {
  if (deploymentType === "self_hosted") return rawUrl.replace(/\/$/, "");
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    u.protocol = "https:";
    const port = u.port ? Number(u.port) : null;
    if (!port || CONSOLE_PORTS.has(port)) u.port = String(DEFAULT_MANAGEMENT_PORT);
    const path = (basePath || DEFAULT_BASE_PATH).replace(/\/$/, "");
    u.pathname = path.startsWith("/") ? path : `/${path}`;
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return rawUrl.replace(/\/$/, "");
  }
}


export async function getEmqxManagementConfig(): Promise<EmqxManagementConfig> {
  const envUrl = Deno.env.get("EMQX_API_URL");
  const envMqttHost = Deno.env.get("EMQX_MQTT_HOST") || null;
  // Deployment-specific default: the MQTT/deployment host on 8443 with /api/v5.
  const envDerived = envUrl ||
    buildUrl(envMqttHost, DEFAULT_MANAGEMENT_PORT, DEFAULT_BASE_PATH) ||
    DEFAULT_URL;
  const fallback: EmqxManagementConfig = {
    apiUrl: toDeploymentEndpoint(envDerived, "serverless", DEFAULT_BASE_PATH),
    managementHost: null,
    managementPort: DEFAULT_MANAGEMENT_PORT,
    apiBasePath: DEFAULT_BASE_PATH,
    mqttHost: envMqttHost,
    mqttPort: Number(Deno.env.get("EMQX_MQTT_PORT")) || 8883,
    managementEnabled: true,
    deploymentType: "serverless",
    source: envUrl ? "env" : "default",
  };

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return fallback;

  try {
    const res = await fetch(
      `${url}/rest/v1/platform_kv_settings?key=eq.emqx_management_config&select=value`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!res.ok) return fallback;
    const rows = await res.json();
    const v = Array.isArray(rows) ? rows[0]?.value : null;
    if (!v || typeof v !== "object") return fallback;

    const basePath = typeof v.api_base_path === "string" && v.api_base_path ? v.api_base_path : DEFAULT_BASE_PATH;
    const deploymentType = (v.deployment_type as EmqxManagementConfig["deploymentType"]) || "serverless";
    const port = v.management_port ? Number(v.management_port) : DEFAULT_MANAGEMENT_PORT;
    const host = v.management_host ?? null;
    const built = typeof v.api_url === "string" && v.api_url
      ? v.api_url.replace(/\/$/, "")
      : buildUrl(host, port, basePath) ||
        buildUrl(v.mqtt_host ?? fallback.mqttHost, port, basePath);

    const apiUrl = toDeploymentEndpoint(built || fallback.apiUrl, deploymentType, basePath);

    return {
      apiUrl,
      managementHost: host,
      managementPort: port,
      apiBasePath: basePath,
      mqttHost: v.mqtt_host ?? fallback.mqttHost,
      mqttPort: v.mqtt_port ? Number(v.mqtt_port) : fallback.mqttPort,
      managementEnabled: v.management_enabled !== false,
      deploymentType,
      source: "settings",
    };
  } catch {
    return fallback;

  }
}

/** Classify an EMQX management API failure into a user-facing reason. */
export function classifyManagementFailure(status: number | null, detail: string): {
  reason: string;
  hint: string;
} {
  if (status === 404) {
    return {
      reason: "management_api_not_found",
      hint:
        "The management endpoint returned 404. Serverless deployments do not expose /api/v5 on the public console host — set the deployment-specific management host (usually port 8443) in EMQX endpoint settings.",
    };
  }
  if (status === 401 || status === 403) {
    return {
      reason: "management_api_unauthorized",
      hint: "The management API rejected the credentials. Rotate/activate a valid application API key & secret in the EMQX credential rotation panel.",
    };
  }
  if (status === null) {
    return {
      reason: "management_api_unreachable",
      hint: `The management host could not be reached (${detail.slice(0, 120)}). Verify the host and port in EMQX endpoint settings.`,
    };
  }
  return {
    reason: "management_api_error",
    hint: `EMQX responded with ${status}: ${detail.slice(0, 160)}`,
  };
}
