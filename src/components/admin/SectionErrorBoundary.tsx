import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type PortalType } from "./PortalNavigation";

interface Props {
  section: string;
  onSwitchPortal?: (portal: PortalType) => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Isolated error boundary for admin portal sections (CRM, ERP, Support, Content Editor, Marketing, Docs).
 * Ensures an unhandled error in one section cannot crash or destabilize any sibling section.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[SectionErrorBoundary:${this.props.section}] Crash isolated:`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <Card className="p-6 border-destructive/40 bg-destructive/5 text-card-foreground shadow-sm my-4">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive mt-0.5">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-lg font-semibold text-foreground">
                  {this.props.section} Section Temporarily Unavailable
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border">
                  Isolated Fault
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                An isolated error occurred inside the <strong>{this.props.section}</strong> module.
                Sibling sections (CRM, ERP, Support, Content Editor, Marketing, and Docs) remain fully operational and intact.
              </p>
              {this.state.error && (
                <div className="text-xs font-mono p-3 rounded bg-muted/80 text-foreground overflow-x-auto max-h-32 border">
                  {this.state.error.message || "Unknown error"}
                </div>
              )}
              <div className="flex items-center gap-3 pt-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={this.handleReset}
                  className="gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry {this.props.section}
                </Button>
                {this.props.onSwitchPortal && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => this.props.onSwitchPortal?.('support')}
                    className="gap-2"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Switch to Support Portal
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
