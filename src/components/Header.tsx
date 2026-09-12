import React from 'react';
import { Layers, FolderOpen, RefreshCw, Sparkles } from 'lucide-react';

interface HeaderProps {
  status: 'idle' | 'processing' | 'ready' | 'completed' | 'error';
  onReset: () => void;
  onOpenOutput?: () => void;
  onLoadDemo?: () => void;
  hasOutput: boolean;
}

export const Header: React.FC<HeaderProps> = ({ status, onReset, onOpenOutput, onLoadDemo, hasOutput }) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-full bg-[#382700] text-[#e3b341] border border-[#bb8009]/40">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e3b341] animate-pulse" />
            Processing
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-full bg-[#0d281e] text-[#3fb950] border border-[#2ea043]/40">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
            Ready for Premiere
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-full bg-[#3c1e22] text-[#f85149] border border-[#da3633]/40">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f85149]" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-full bg-[#161b22] text-[#8b949e] border border-[#30363d]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6e7681]" />
            Idle
          </span>
        );
    }
  };

  return (
    <header className="h-14 border-b border-[#30363d] bg-[#161b22] px-5 flex items-center justify-between select-none">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#c9d1d9]">
          <Layers className="w-4 h-4 text-[#58a6ff]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-wide text-[#f0f6fc] font-sans">SyncCut</h1>
            <span className="text-[10px] text-[#8b949e] px-1.5 py-0.5 rounded-md bg-[#21262d] border border-[#30363d] font-mono">v0.1.0</span>
          </div>
          <p className="text-[11px] text-[#8b949e]">AI Video-Audio Aligner & Premiere XML Engine</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {getStatusBadge()}

        {onLoadDemo && (
          <button
            onClick={onLoadDemo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#f0f6fc] bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-md transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#e3b341]" />
            Load Demo
          </button>
        )}

        {hasOutput && onOpenOutput && (
          <button
            onClick={onOpenOutput}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#c9d1d9] bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-md transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#58a6ff]" />
            Open Folder
          </button>
        )}

        <button
          onClick={onReset}
          title="Reset All"
          className="p-1.5 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded-md border border-transparent hover:border-[#30363d] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
