"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the child
 * component tree and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[200px] flex flex-col items-center justify-center p-6 border border-red-500/30 bg-red-500/5">
          <div className="text-red-500 font-mono text-sm mb-4">
            Something went wrong
          </div>
          <div className="text-neutral-500 text-xs font-mono mb-4 max-w-md text-center">
            {this.state.error?.message || "An unexpected error occurred"}
          </div>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-mono transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Game-specific error boundary with poker-themed styling
 */
export class GameErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Game error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="max-w-md w-full border border-neutral-800 p-6">
            <div className="text-center mb-6">
              <div className="text-2xl font-bold text-white font-mono mb-2">
                GAME ERROR
              </div>
              <div className="text-neutral-500 text-sm font-mono">
                An error occurred during gameplay
              </div>
            </div>

            <div className="p-3 bg-neutral-900 border border-neutral-800 mb-6">
              <div className="text-xs font-mono text-red-400 break-all">
                {this.state.error?.message || "Unknown error"}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 bg-white text-black font-mono font-bold hover:bg-neutral-200 transition-colors"
              >
                RELOAD GAME
              </button>
              <button
                onClick={this.handleHome}
                className="flex-1 py-3 bg-neutral-800 text-white font-mono font-bold hover:bg-neutral-700 transition-colors"
              >
                BACK TO HOME
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
