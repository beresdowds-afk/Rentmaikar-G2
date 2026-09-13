import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Props {
  subPage: string;
  onResetToDialer?: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Isolated error boundary for Call Center sub-pages (Dialer, WhatsApp Voice, Visual IVR,
 * Numbers, Extensions, Voice Health, Queue, Call Log, Recordings, Conferences, Settings).
 *
 * Ensures an unhandled error inside one sub-page CANNOT tear down the entire Call Center,
 * drop an active call, or crash sibling sub-pages.
 */
export class CallCenterSubPageErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[CallCenterSubPageErrorBoundary:${this.props.subPage}] Isolated sub-page fault:`, error, errorInfo);
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
                  {this.props.subPage} Temporarily Unavailable
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border">
                  Isolated Sub-Page Fault
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                An isolated error occurred inside the <strong>{this.props.subPage}</strong> module.
                Active voice calls, the softphone dialer, and all other Call Center sub-pages remain fully operational.
              </p>
              {this.state.error?.message && (
                <div className="rounded-md bg-muted/70 p-2.5 text-xs font-mono text-muted-foreground break-all">
                  {this.state.error.message}
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={this.handleReset}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry {this.props.subPage}
                </Button>
                {this.props.onResetToDialer && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      this.handleReset();
                      this.props.onResetToDialer?.();
                    }}
                    className="gap-1.5"
                  >
                    <PhoneCall className="h-4 w-4" />
                    Return to Softphone Dialer
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
