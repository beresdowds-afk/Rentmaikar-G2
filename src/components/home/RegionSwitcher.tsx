import { useRegion } from "@/contexts/RegionContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe, Loader2, RefreshCw, WifiOff, CloudOff } from "lucide-react";

/** "3 minutes ago" style label — deliberately dependency free. */
function relativeTime(ts: number | null): string {
  if (!ts) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const RegionSwitcher = () => {
  const { country, setCountry, availableRegions, regionsLoading, regionSync, refreshRegions } =
    useRegion();

  const currentRegion =
    availableRegions.find((r) => r.value === country) ?? availableRegions[0];

  // Offline wins over "stale": it explains *why* the list may be behind.
  const showOffline = regionSync.offline;
  const showStale = !showOffline && regionSync.stale && regionSync.source !== "live";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-sm">
          <Globe className="w-4 h-4" />
          <span className="hidden sm:inline">
            {currentRegion?.flag} {currentRegion?.label ?? country}
          </span>
          <span className="sm:hidden">{currentRegion?.flag}</span>
          {(showOffline || showStale) && (
            <WifiOff className="h-3 w-3 text-muted-foreground" aria-label="Showing saved regions" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-64 overflow-y-auto">
        {availableRegions.map((region) => (
          <DropdownMenuItem
            key={region.value}
            onClick={() => setCountry(region.value)}
            className={country === region.value ? "bg-accent/10" : ""}
          >
            <span className="mr-2">{region.flag}</span>
            {region.label}
          </DropdownMenuItem>
        ))}
        {regionsLoading && (
          <DropdownMenuItem disabled className="text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Loading regions…
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="py-1 text-[11px] font-normal text-muted-foreground">
          {showOffline ? (
            <span className="flex items-center gap-1.5">
              <CloudOff className="h-3 w-3" />
              Offline — showing saved regions
            </span>
          ) : showStale ? (
            <span className="flex items-center gap-1.5">
              <CloudOff className="h-3 w-3" />
              Live updates delayed — saved list
            </span>
          ) : (
            <span>Live region list</span>
          )}
          <span className="mt-0.5 block">Last synced {relativeTime(regionSync.lastSyncedAt)}</span>
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            // Keep the menu open so the user can watch the refresh resolve.
            e.preventDefault();
            void refreshRegions();
          }}
          disabled={regionSync.refreshing}
        >
          <RefreshCw
            className={`mr-2 h-3.5 w-3.5 ${regionSync.refreshing ? "animate-spin" : ""}`}
          />
          {regionSync.refreshing ? "Refreshing…" : "Refresh regions"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RegionSwitcher;
