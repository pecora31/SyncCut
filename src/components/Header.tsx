import React from 'react';
import { Layers, FolderOpen, RefreshCw } from 'lucide-react';

interface HeaderProps {
  status: 'idle' | 'processing' | 'ready' | 'completed' | 'error';
  onReset: () => void;
  onOpenOutput?: () => void;
  hasOutput: boolean;
}

export const Header: React.FC<HeaderProps> = ({ status, onReset, onOpenOutput, hasOutput }) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            PROCESSING
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            READY FOR PREMIERE
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            ERROR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            IDLE
          </span>
        );
    }
  };

  return (
    <header className="h-14 border-b border-[#24242c] bg-[#121215] px-5 flex items-center justify-between select-none">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-[#1e1e26] border border-[#30303c] flex items-center justify-center text-indigo-400">
          <Layers className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-wide text-zinc-100 uppercase font-mono">SyncCut</h1>
            <span className="text-[10px] text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 font-mono">v0.1.0</span>
          </div>
          <p className="text-[11px] text-zinc-500">AI Video-Audio Aligner & Premiere XML Engine</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {getStatusBadge()}

        {hasOutput && onOpenOutput && (
          <button
            onClick={onOpenOutput}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-[#1a1a20] hover:bg-[#23232c] border border-[#323240] rounded transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
            Open Folder
          </button>
        )}

        <button
          onClick={onReset}
          title="Reset All"
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f26] rounded border border-transparent hover:border-[#323240] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
