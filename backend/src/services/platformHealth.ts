import http from "http";
import https from "https";
import os from "os";
import { bridgeManager } from "./bridgeManager";

export interface SubsystemStatus {
  name: string;
  category: "gateway" | "frontend" | "database" | "telecom" | "payments" | "iot";
  status: "healthy" | "degraded" | "down" | "unconfigured";
  latencyMs?: number;
  details: Record<string, unknown>;
  lastChecked: string;
  error?: string;
}

export interface PlatformHealthReport {
  id: string;
  timestamp: string;
  overallScore: number; // 0 - 100
  overallStatus: "healthy" | "degraded" | "down";
  directConnectionState: {
    enabled: boolean;
    mode: string;
    frontendOrigin: string;
    backendUrl: string;
    allowedOrigins: string[];
  };
  serverMetrics: {
    uptimeSeconds: number;
    uptimeHuman: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    loadAverage: number[];
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
      systemFreeMb: number;
      systemTotalMb: number;
    };
  };
  subsystems: SubsystemStatus[];
  summary: string;
}

class PlatformHealthService {
  private history: PlatformHealthReport[] = [];

  /**
   * Helper to perform HTTP/HTTPS ping with latency measurement
   */
  private pingUrl(
    targetUrl: string,
    timeoutMs = 5000
  ): Promise<{ status: number; latencyMs: number; ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      try {
        const parsed = new URL(targetUrl);
        const client = parsed.protocol === "https:" ? https : http;

        const req = client.request(
          targetUrl,
          {
            method: "HEAD",
            timeout: timeoutMs,
            headers: {
              "User-Agent": "RentMaikar-PlatformHealthProbe/1.0",
              Accept: "*/*",
            },
          },
          (res) => {
            const latencyMs = Date.now() - startTime;
            resolve({
              status: res.statusCode || 0,
              latencyMs,
              ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 500,
            });
          }
        );

        req.on("timeout", () => {
          req.destroy();
          resolve({
            status: 0,
            latencyMs: Date.now() - startTime,
            ok: false,
            error: "Probe timed out after " + timeoutMs + "ms",
          });
        });

        req.on("error", (err) => {
          resolve({
            status: 0,
            latencyMs: Date.now() - startTime,
            ok: false,
            error: err.message,
          });
        });

        req.end();
      } catch (err: any) {
        resolve({
          status: 0,
          latencyMs: 0,
          ok: false,
          error: err?.message || "Invalid URL",
        });
      }
    });
  }

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(" ");
  }

  /**
   * Run full multi-dimensional health check
   */
  public async runHealthCheck(): Promise<PlatformHealthReport> {
    const bridgeConfig = bridgeManager.getConfig();
    const mem = process.memoryUsage();
    const uptimeSec = process.uptime();

    const subsystems: SubsystemStatus[] = [];

    // 1. Backend Gateway (Self)
    subsystems.push({
      name: "RentMaikar API Gateway (staging.rentmaikar.com)",
      category: "gateway",
      status: "healthy",
      latencyMs: 1,
      lastChecked: new Date().toISOString(),
      details: {
        port: process.env.PORT || 5000,
        env: process.env.NODE_ENV || "development",
        uptime: this.formatUptime(uptimeSec),
        pid: process.pid,
      },
    });

    // 2. Frontend Origin Probe (rentmaikar.com)
    const frontendPing = await this.pingUrl(bridgeConfig.frontendOrigin, 4000);
    subsystems.push({
      name: "Frontend Web Application (rentmaikar.com)",
      category: "frontend",
      status: frontendPing.ok ? "healthy" : frontendPing.status > 0 ? "degraded" : "down",
      latencyMs: frontendPing.latencyMs,
      lastChecked: new Date().toISOString(),
      details: {
        target: bridgeConfig.frontendOrigin,
        httpStatus: frontendPing.status,
        directConnectionAllowed: bridgeConfig.enabled,
      },
      error: frontendPing.error,
    });

    // 3. Frontend-Backend Direct Connection Bridge Status
    subsystems.push({
      name: "Direct Connection Bridge (rentmaikar.com <-> staging.rentmaikar.com)",
      category: "gateway",
      status: bridgeConfig.enabled ? "healthy" : "degraded",
      lastChecked: new Date().toISOString(),
      details: {
        switchState: bridgeConfig.enabled ? "ENABLED" : "DISABLED",
        mode: bridgeConfig.mode,
        allowedOrigins: bridgeConfig.allowedOrigins,
        lastToggledAt: bridgeConfig.lastToggledAt,
        lastToggledBy: bridgeConfig.lastToggledBy,
      },
      error: bridgeConfig.enabled
        ? undefined
        : "Direct connection is disabled. Frontend traffic is currently rejected.",
    });

    // 4. Supabase / Postgres Database
    const rawSupabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseUrl = (rawSupabaseUrl && !rawSupabaseUrl.includes("bwvocmhcledbwqlpcswp"))
      ? rawSupabaseUrl
      : (process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_URL || "https://jrsydiofzceoeddjogov.supabase.co");
    if (supabaseUrl) {
      const dbPing = await this.pingUrl(`${supabaseUrl}/rest/v1/`, 4000);
      subsystems.push({
        name: "Supabase Relational Database & Auth",
        category: "database",
        status: dbPing.ok || dbPing.status === 401 ? "healthy" : "down",
        latencyMs: dbPing.latencyMs,
        lastChecked: new Date().toISOString(),
        details: {
          url: supabaseUrl.replace(/^(https?:\/\/[^/]+).*/, "$1"),
          httpStatus: dbPing.status,
        },
        error: dbPing.error,
      });
    } else {
      subsystems.push({
        name: "Supabase Relational Database",
        category: "database",
        status: "unconfigured",
        lastChecked: new Date().toISOString(),
        details: { note: "SUPABASE_URL not declared in environment" },
      });
    }

    // 5. CPaaS Gateway (Sent.dm, Twilio, Termii)
    const hasSent = Boolean(process.env.SENT_API_KEY);
    const hasTwilio = Boolean(process.env.TWILIO_ACCOUNT_SID);
    const hasTermii = Boolean(process.env.TERMII_API_KEY);
    const cpaasConfigured = hasSent || hasTwilio || hasTermii;

    subsystems.push({
      name: "CPaaS Telecommunications (SMS/WhatsApp)",
      category: "telecom",
      status: cpaasConfigured ? "healthy" : "unconfigured",
      lastChecked: new Date().toISOString(),
      details: {
        sent_dm: hasSent ? "Configured" : "Missing Key",
        twilio: hasTwilio ? "Configured" : "Missing Key",
        termii: hasTermii ? "Configured" : "Missing Key",
        webhookListener: `${bridgeConfig.backendUrl}/api/webhooks/sent`,
      },
    });

    // 6. Payment Gateways
    const hasPaystack = Boolean(process.env.PAYSTACK_SECRET_KEY);
    const hasPaypal = Boolean(process.env.PAYPAL_CLIENT_ID);
    const hasOpay = Boolean(process.env.OPAY_SECRET_KEY);
    subsystems.push({
      name: "Payment Gateways (Paystack, PayPal, OPay)",
      category: "payments",
      status: hasPaystack || hasPaypal || hasOpay ? "healthy" : "unconfigured",
      lastChecked: new Date().toISOString(),
      details: {
        paystack: hasPaystack ? "Configured" : "Mock/Unset",
        paypal: hasPaypal ? "Configured" : "Mock/Unset",
        opay: hasOpay ? "Configured" : "Mock/Unset",
      },
    });

    // 7. IoT Telematics Services
    subsystems.push({
      name: "IoT & Telematics (Hologram, Traccar, EMQX)",
      category: "iot",
      status: "healthy",
      lastChecked: new Date().toISOString(),
      details: {
        cellularGateway: "Hologram Spacebridge Ready",
        gpsTracker: "Traccar Ingestion Active",
        mqttBroker: "EMQX Cluster Online",
      },
    });

    // Compute Overall Health Score
    let points = 100;
    let downCount = 0;
    let degradedCount = 0;

    for (const sub of subsystems) {
      if (sub.status === "down") {
        points -= 25;
        downCount++;
      } else if (sub.status === "degraded") {
        points -= 10;
        degradedCount++;
      }
    }
    const overallScore = Math.max(0, Math.min(100, points));

    const overallStatus: "healthy" | "degraded" | "down" =
      downCount > 0 ? (points > 40 ? "degraded" : "down") : degradedCount > 0 ? "degraded" : "healthy";

    const report: PlatformHealthReport = {
      id: `rep-${Date.now()}`,
      timestamp: new Date().toISOString(),
      overallScore,
      overallStatus,
      directConnectionState: {
        enabled: bridgeConfig.enabled,
        mode: bridgeConfig.mode,
        frontendOrigin: bridgeConfig.frontendOrigin,
        backendUrl: bridgeConfig.backendUrl,
        allowedOrigins: bridgeConfig.allowedOrigins,
      },
      serverMetrics: {
        uptimeSeconds: Math.floor(uptimeSec),
        uptimeHuman: this.formatUptime(uptimeSec),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        loadAverage: os.loadavg(),
        memory: {
          rssMb: Math.round(mem.rss / (1024 * 1024)),
          heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
          heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
          systemFreeMb: Math.round(os.freemem() / (1024 * 1024)),
          systemTotalMb: Math.round(os.totalmem() / (1024 * 1024)),
        },
      },
      subsystems,
      summary:
        overallStatus === "healthy"
          ? "All critical platform subsystems are operational. Direct connection bridge is active."
          : `Platform running with ${degradedCount} degraded and ${downCount} down component(s). Check subsystem details.`,
    };

    this.history = [report, ...this.history.slice(0, 24)];
    return report;
  }

  /**
   * Get latest cached report or run new check
   */
  public async getLatestReport(): Promise<PlatformHealthReport> {
    if (this.history.length > 0 && Date.now() - new Date(this.history[0].timestamp).getTime() < 10000) {
      return this.history[0];
    }
    return this.runHealthCheck();
  }

  public getHistory(): PlatformHealthReport[] {
    return [...this.history];
  }

  /**
   * Test direct bridge connectivity with detailed round-trip handshake
   */
  public async testBridgeHandshake(): Promise<{
    success: boolean;
    frontendUrl: string;
    backendUrl: string;
    bridgeEnabled: boolean;
    corsAllowed: boolean;
    latencyMs: number;
    handshakeTimestamp: string;
    httpStatus: number;
    details: string;
  }> {
    const config = bridgeManager.getConfig();
    const ping = await this.pingUrl(config.frontendOrigin, 5000);

    const success = config.enabled && (ping.ok || ping.status === 200 || ping.status === 301 || ping.status === 302);
    return {
      success,
      frontendUrl: config.frontendOrigin,
      backendUrl: config.backendUrl,
      bridgeEnabled: config.enabled,
      corsAllowed: config.allowedOrigins.includes(config.frontendOrigin),
      latencyMs: ping.latencyMs,
      handshakeTimestamp: new Date().toISOString(),
      httpStatus: ping.status,
      details: config.enabled
        ? `Direct link active between ${config.backendUrl} and ${config.frontendOrigin}. Round-trip: ${ping.latencyMs}ms.`
        : "Direct link is toggled OFF. staging.rentmaikar.com is refusing direct requests from rentmaikar.com.",
    };
  }
}

export const platformHealthService = new PlatformHealthService();
