import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Radio, Wifi, WifiOff } from "lucide-react";

type ChannelStatus =
  | "IDLE"
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "CONNECTING";

interface Event {
  at: string;
  type: string;
  region_code: string | null;
  summary: string;
}

export default function CompanyInfoRealtimeDebug() {
  const [status, setStatus] = useState<ChannelStatus>("IDLE");
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setStatus("CONNECTING");
    const channel = supabase
      .channel("debug-platform-company-info")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_company_info" },
        (payload) => {
          const at = new Date().toISOString();
          setLastAt(at);
          const row: any = payload.new ?? payload.old ?? {};
          setEvents((prev) =>
            [
              {
                at,
                type: payload.eventType,
                region_code: row.region_code ?? null,
                summary: `${row.company_name ?? "(no name)"} · ${row.contact_email ?? ""}`.trim(),
              },
              ...prev,
            ].slice(0, 30),
          );
        },
      )
      .subscribe((s, err) => {
        setStatus(s as ChannelStatus);
        if (err) setErrorMsg(err.message ?? String(err));
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isHealthy = status === "SUBSCRIBED";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5" /> Company Info Realtime Debug
        </CardTitle>
        <CardDescription>
          Confirms that <code>platform_company_info</code> changes are streaming into the footer via
          Supabase Realtime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={isHealthy ? "default" : "secondary"} className="gap-1">
            {isHealthy ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {status}
          </Badge>
          <div className="text-muted-foreground">
            Last update:&nbsp;
            <b className="text-foreground">
              {lastAt ? new Date(lastAt).toLocaleString() : "never"}
            </b>
          </div>
          <div className="text-muted-foreground">
            Events buffered: <b className="text-foreground">{events.length}</b>
          </div>
        </div>

        {errorMsg && (
          <Alert variant="destructive">
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        {!isHealthy && (
          <Alert>
            <AlertDescription className="text-sm">
              Not subscribed yet. If this stays in <b>CHANNEL_ERROR</b> or <b>TIMED_OUT</b>, the
              <code> supabase_realtime</code> publication may not include{" "}
              <code>platform_company_info</code>. Re-run the migration that adds it to the
              publication.
            </AlertDescription>
          </Alert>
        )}

        <ScrollArea className="h-56 rounded border">
          <div className="divide-y">
            {events.length === 0 && (
              <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" /> Waiting for the next{" "}
                <code>platform_company_info</code> change…
              </div>
            )}
            {events.map((e, i) => (
              <div key={i} className="p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="uppercase">
                    {e.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleTimeString()}
                  </span>
                  {e.region_code && (
                    <Badge variant="secondary">{e.region_code}</Badge>
                  )}
                </div>
                <div className="mt-1 text-muted-foreground">{e.summary}</div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
