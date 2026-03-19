'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onRegenerate: () => void;
}

interface State {
  hasError: boolean;
}

export default class MermaidErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-red-900/20 border border-red-800">
          <p className="text-red-400 text-sm">Syntax error in diagram</p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onRegenerate();
            }}
            className="text-xs px-3 py-1.5 rounded bg-red-800 hover:bg-red-700 text-red-200 transition-colors"
          >
            Regenerate
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
