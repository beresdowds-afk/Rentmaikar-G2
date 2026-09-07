import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Server, CheckCircle2, AlertCircle, RefreshCw, Globe, Database } from "lucide-react";
import { backendClient, type BackendHealthResponse, type DomainMappingResponse } from "@/lib/backend-client";

export function BackendGatewayHealthCard() {
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [domains, setDomains] = useState<DomainMappingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [healthRes, domainsRes] = await Promise.allSettled([
        backendClient.checkHealth(),
        backendClient.getDomains(),
      ]);

      if (healthRes.status === "fulfilled") {
        setHealth(healthRes.value);
      } else {
        setHealth(null);
        setError(healthRes.reason?.message || "Backend API is unreachable");
      }

      if (domainsRes.status === "fulfilled") {
        setDomains(domainsRes.value);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect to backend");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void checkStatus();
  }, []);

  return (
    <Card id="backend-gateway-health-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-primary" /> Backend API Gateway & Database Link
          </CardTitle>
          <CardDescription>
            Live connectivity between the React frontend, Express API Gateway, and dedicated Supabase.
          </CardDescription>
        </div>
        <Button
          id="btn-recheck-backend-gateway"
          size="sm"
          variant="outline"
          onClick={() => void checkStatus()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Check Gateway
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Gateway Status */}
          <div className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground font-medium">Gateway Service</div>
              <div className="font-medium text-foreground">
                {health?.service || "rentmaikar-backend-gateway"}
              </div>
            </div>
            {health?.status === "healthy" ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3" /> Online
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 gap-1 text-xs">
                <AlertCircle className="h-3 w-3" /> {error ? "Offline / Staging" : "Checking"}
              </Badge>
            )}
          </div>

          {/* Database Target */}
          <div className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground font-medium">Supabase Target</div>
              <div className="font-mono text-xs text-foreground">
                jrsydiofzceoeddjogov
              </div>
            </div>
            <Badge variant="outline" className="border-primary/50 text-primary gap-1 text-xs">
              <Database className="h-3 w-3" /> Dedicated
            </Badge>
          </div>
        </div>

        {/* Domain Mapping */}
        {domains?.domains && (
          <div className="p-3 rounded-lg border bg-muted/10 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Globe className="h-3.5 w-3.5" /> Platform Domain Architecture
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              <div>
                <span className="text-muted-foreground">Frontend: </span>
                <span className="text-foreground font-medium">{domains.domains.frontendDomain}</span>
              </div>
              <div>
                <span className="text-muted-foreground">API Gateway: </span>
                <span className="text-foreground font-medium">{domains.domains.backendDomain}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
