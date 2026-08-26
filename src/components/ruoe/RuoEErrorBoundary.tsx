import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RuoEErrorBoundaryProps, RuoEErrorBoundaryState } from '@/types/ruoe';

export class RuoEErrorBoundary extends React.Component<
  RuoEErrorBoundaryProps,
  RuoEErrorBoundaryState
> {
  constructor(props: RuoEErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: undefined,
    };
  }

  static getDerivedStateFromError(error: Error): RuoEErrorBoundaryState {
    return {
      hasError: true,
      error: error.message,
      errorInfo: undefined,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      errorInfo,
    });

    // Log error to console for development
    console.error('R&UoE Error Boundary caught an error:');

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: undefined,
    });
  };

  handleBackToDashboard = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return (
          <FallbackComponent
            error={this.state.error || 'An unexpected error occurred'}
            retry={this.handleRetry}
          />
        );
      }

      // Default error UI
      return (
        <div className="container mx-auto p-6 max-w-4xl">
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-red-600" />
                <div>
                  <CardTitle className="text-xl text-red-800">
                    Something went wrong
                  </CardTitle>
                  <p className="text-sm text-red-600 mt-1">
                    There was an error while loading the R&UoE exercise
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border border-red-200">
                  <h4 className="font-semibold text-gray-800 mb-2">Error Details:</h4>
                  <p className="text-sm text-gray-600 font-mono">
                    {this.state.error || 'Unknown error occurred'}
                  </p>
                </div>

                {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                  <details className="bg-gray-100 rounded-lg p-4">
                    <summary className="font-semibold text-gray-700 cursor-pointer">
                      Technical Details (Development Only)
                    </summary>
                    <pre className="mt-2 text-xs text-gray-600 overflow-auto">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={this.handleRetry}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Try Again
                  </Button>
                  <Button
                    variant="outline"
                    onClick={this.handleBackToDashboard}
                    className="border-gray-300"
                  >
                    Back to Dashboard
                  </Button>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-blue-800 mb-2">What you can do:</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Try refreshing the page</li>
                    <li>• Check your internet connection</li>
                    <li>• Return to the dashboard and try a different exercise</li>
                    <li>• Contact support if the problem persists</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Export a functional component wrapper for easier usage
export const withRuoEErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ComponentType<{ error: string; retry: () => void }>
) => {
  const WrappedComponent = (props: P) => (
    <RuoEErrorBoundary fallback={fallback}>
      <Component {...props} />
    </RuoEErrorBoundary>
  );

  WrappedComponent.displayName = `withRuoEErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
};