import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(...segments: string[]): string {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

describe("deployment portal isolation", () => {
  it("denies portal paths on all frontend nginx configurations", () => {
    for (const configPath of ["nginx.conf", "nginx.conf.template", "frontend/nginx.conf"]) {
      const config = readRepoFile(configPath);

      for (const route of ["portal", "admin"]) {
        expect(config).toMatch(new RegExp(`location = \\/${route} \\{ return 404; \\}`));
        expect(config).toMatch(new RegExp(`location \\^~ \\/${route}\\/ \\{ return 404; \\}`));
      }

      expect(config).toContain("location /api/");
      expect(config).toContain("location /functions/v1/");
      expect(config).toContain("location /healthz");
      expect(config).toContain("try_files $uri $uri/ /index.html;");
    }
  });

  it("uses the staging API URL for frontend builds and bridge defaults", () => {
    const apiBase = "https://staging.rentmaikar.com/api";

    for (const dockerfile of ["Dockerfile", "frontend/Dockerfile"]) {
      expect(readRepoFile(dockerfile)).toContain(`VITE_API_BASE_URL=${apiBase}`);
      expect(readRepoFile(dockerfile)).toContain(`VITE_STAGING_API_BASE_URL=${apiBase}`);
    }

    expect(readRepoFile("cloudbuild.yaml")).toContain(`VITE_API_BASE_URL=${apiBase}`);
    expect(readRepoFile(".github/workflows/deploy.yml")).toContain(`VITE_API_BASE_URL=${apiBase}`);
    expect(readRepoFile("src/lib/backend-bridge.ts")).toMatch(
      /private readonly publicGatewayUrl: string =\s*"https:\/\/staging\.rentmaikar\.com\/api"/,
    );
  });

  it("gates portal HTML on the staging host and protects bridge administration", () => {
    const backend = readRepoFile("backend/src/index.ts");
    expect(backend).toContain('req.hostname.toLowerCase() === DOMAIN_MAPPING.backendDomain');
    expect(backend).toMatch(/app\.get\("\/",[\s\S]*?if \(!isStagingPortalHost\(req\)\)/);
    expect(backend).toMatch(/app\.get\(\["\/portal", "\/portal\/\*", "\/admin", "\/admin\/\*"\],[\s\S]*?if \(!isStagingPortalHost\(req\)\)/);

    const bridge = readRepoFile("backend/src/routes/bridge.ts");
    for (const route of [
      "/status",
      "/telemetry",
      "/broadcast",
      "/toggle",
      "/package-frontend",
      "/auto-disconnect",
      "/simulate-frontend-call",
    ]) {
      expect(bridge).toMatch(new RegExp(`bridgeRouter\\.(?:get|post)\\("${route}", requirePortalAuth, requireAdminRole`));
    }
    expect(bridge).toContain('["diagnostics", "status", "get_status"]');
    expect(bridge).toContain('bridgeRouter.get("/health", (req: Request, res: Response) =>');
  });
});
