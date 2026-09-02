import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SplitPaneProps {
  list: ReactNode;
  detail: ReactNode;
  hasSelection: boolean;
  emptyState?: ReactNode;
  className?: string;
  listClassName?: string;
  detailClassName?: string;
  /** Height of the split-pane on xl+ screens. */
  height?: string;
}

/**
 * List + detail shell that collapses to a single stacked column below xl.
 * At xl+ it becomes a 2:3 grid with independently scrolling panes so wide
 * screens surface both the list and the currently-selected record without
 * hiding either behind a dialog.
 */
export const SplitPane = ({
  list,
  detail,
  hasSelection,
  emptyState,
  className,
  listClassName,
  detailClassName,
  height = "min(760px, 72dvh)",
}: SplitPaneProps) => {
  return (
    <div
      className={cn(
        "grid gap-4 xl:grid-cols-5",
        className,
      )}
      style={{ ["--split-pane-h" as string]: height } as React.CSSProperties}
    >
      <div
        className={cn(
          "xl:col-span-2 xl:border xl:rounded-lg xl:bg-card xl:overflow-hidden",
          listClassName,
        )}
      >
        <ScrollArea
          className="xl:h-[var(--split-pane-h)]"
          type="always"
        >
          <div className="p-2 xl:p-3">{list}</div>
        </ScrollArea>
      </div>

      <div
        className={cn(
          "hidden xl:block xl:col-span-3 xl:border xl:rounded-lg xl:bg-card xl:overflow-hidden",
          detailClassName,
        )}
      >
        <ScrollArea
          className="xl:h-[var(--split-pane-h)]"
          type="always"
        >
          <div className="p-4">
            {hasSelection
              ? detail
              : emptyState ?? (
                  <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-muted-foreground">
                    Select an item to see details
                  </div>
                )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default SplitPane;
