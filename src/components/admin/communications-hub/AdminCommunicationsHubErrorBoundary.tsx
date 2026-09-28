import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  sectionName?: string;
  compact?: boolean;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  debugId: string | null;
  timestamp: string | null;
}

const sanitizeLogText = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/(bearer\s+[\w.-]+)/gi, 'bearer [REDACTED]')
    .replace(/(key=[\w.-]+)/gi, 'key=[REDACTED]')
    .replace(/(token=[\w.-]+)/gi, 'token=[REDACTED]')
    .replace(/(secret=[\w.-]+)/gi, 'secret=[REDACTED]')
    .replace(/(password=[\w.-]+)/gi, 'password=[REDACTED]')
    .replace(/(authorization:\s*[\w.-]+)/gi, 'authorization: [REDACTED]');
};

export class AdminCommunicationsHubErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    debugId: null,
    timestamp: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const timestamp = new Date().toISOString();
    const debugId = `hub-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

    this.setState({
      errorInfo,
      debugId,
      timestamp,
    });

    const sectionTag = this.props.sectionName ? `[${this.props.sectionName}] ` : '';
    console.group(`[AdminCommunicationsHub] ${sectionTag}Runtime Error caught (Debug ID: ${debugId})`);
    console.error('Error Name:', error?.name || 'Error');
    console.error('Error Message:', sanitizeLogText(error?.message || 'Unknown runtime error'));
    console.error('Timestamp:', timestamp);
    console.error('Debug Identifier:', debugId);
    if (error?.stack) {
      console.error('Error Stack:', sanitizeLogText(error.stack));
    }
    if (errorInfo?.componentStack) {
      console.error('React Component Stack:', errorInfo.componentStack);
    }
    console.groupEnd();
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      debugId: null,
      timestamp: null,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      // Section-level isolated error state inside tabs
      if (this.props.compact) {
        return (
          <div className="p-4 bg-card border border-destructive/30 rounded-xl shadow-sm space-y-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs text-destructive">
                    {this.props.sectionName ? `${this.props.sectionName} Section Paused` : 'Communications Section Paused'}
                  </h4>
                  {this.state.debugId && (
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      Ref: {this.state.debugId}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  An isolated error occurred in this communications section. Other sections and the Admin Dashboard remain unaffected.
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={this.handleReset}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry Section
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // Global Hub launcher error fallback
      return (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-background/95 backdrop-blur border border-destructive/40 shadow-xl rounded-xl max-w-sm text-sm text-foreground">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-xs text-destructive">Communications Hub Paused</h4>
                {this.state.debugId && (
                  <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1 py-0.5 rounded">
                    Ref: {this.state.debugId}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                An isolated error occurred in the communications widget. The rest of the Admin Dashboard is unaffected.
              </p>
              <div className="pt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={this.handleReset}
                >
                  <RefreshCw className="h-3 w-3" />
                  Restart Hub
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

