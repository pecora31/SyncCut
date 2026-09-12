import React from 'react';
import { Layers, FolderOpen, RefreshCw, Sparkles, Play, Film, Clock, CheckCircle2 } from 'lucide-react';

interface HeaderProps {
  status: 'idle' | 'processing' | 'ready' | 'completed' | 'error';
  onReset: () => void;
  onOpenOutput?: () => void;
  onLoadDemo?: () => void;
  onProcessAndExport: () => void;
  onRenderVideo?: () => void;
  isProcessing: boolean;
  isRendering?: boolean;
  hasOutput: boolean;
  currentTime: number;
  fps: number;
  canProcess: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onReset,
  onOpenOutput,
  onLoadDemo,
  onProcessAndExport,
  onRenderVideo,
  isProcessing,
  isRendering,
  hasOutput,
  currentTime,
  fps,
  canProcess,
}) => {
  // Format seconds to timecode HH:MM:SS:FF
  const formatTimecode = (timeInSeconds: number, targetFps: number) => {
    const totalFrames = Math.floor(timeInSeconds * targetFps);
    const frames = totalFrames % Math.round(targetFps);
    const totalSecs = Math.floor(timeInSeconds);
    const secs = totalSecs % 60;
    const mins = Math.floor(totalSecs / 60) % 60;
    const hours = Math.floor(totalSecs / 3600);

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded bg-[#382700] text-[#e3b341] border border-[#bb8009]/40">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e3b341] animate-pulse" />
            Processing
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded bg-[#0d281e] text-[#3fb950] border border-[#2ea043]/40">
            <CheckCircle2 className="w-3.5 h-3.5" />
            XML Ready
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded bg-[#3c1e22] text-[#f85149] border border-[#da3633]/40">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f85149]" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded bg-[#161b22] text-[#8b949e] border border-[#30363d]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6e7681]" />
            Standby
          </span>
        );
    }
  };

  return (
    <header className="h-12 border-b border-[#30363d] bg-[#161b22] px-4 flex items-center justify-between select-none z-20">
      {/* Left: Branding & Timecode */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#58a6ff]">
            <Layers className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h1 className="text-sm font-semibold tracking-wide text-[#f0f6fc]">SyncCut</h1>
            <span className="text-[10px] text-[#58a6ff] font-mono uppercase tracking-wider font-semibold">Pro Studio</span>
          </div>
        </div>

        <div className="h-4 w-[1px] bg-[#30363d]" />

        {/* Premiere Style Digital Timecode */}
        <div className="flex items-center gap-2 bg-[#0d1117] border border-[#30363d] px-2.5 py-1 rounded">
          <Clock className="w-3.5 h-3.5 text-[#58a6ff]" />
          <span className="text-xs font-mono font-semibold tracking-widest text-[#58a6ff]">
            {formatTimecode(currentTime, fps)}
          </span>
          <span className="text-[10px] font-mono text-[#6e7681]">@{fps}fps</span>
        </div>

        {getStatusBadge()}
      </div>

      {/* Right: Quick Action Controls */}
      <div className="flex items-center gap-2">
        {onLoadDemo && (
          <button
            onClick={onLoadDemo}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#f0f6fc] bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded transition-colors"
            title="Load sample test project"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#e3b341]" />
            Load Demo
          </button>
        )}

        {hasOutput && onRenderVideo && (
          <button
            type="button"
            disabled={isRendering}
            onClick={onRenderVideo}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-[#58a6ff] bg-[#1f242c] hover:bg-[#27303c] border border-[#58a6ff]/40 rounded transition-colors disabled:opacity-50"
          >
            <Film className="w-3.5 h-3.5" />
            {isRendering ? 'Rendering...' : 'Render MP4'}
          </button>
        )}

        {hasOutput && onOpenOutput && (
          <button
            onClick={onOpenOutput}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#c9d1d9] bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#3fb950]" />
            Open XML
          </button>
        )}

        <button
          onClick={onProcessAndExport}
          disabled={!canProcess || isProcessing}
          className="flex items-center gap-1.5 px-3 py-1 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#6e7681] text-white text-xs font-semibold rounded border border-[rgba(240,246,252,0.1)] transition-all shadow-sm"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          {isProcessing ? 'Aligning...' : 'Export Premiere XML'}
        </button>

        <button
          onClick={onReset}
          title="Reset Workspace"
          className="p-1.5 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded border border-transparent hover:border-[#30363d] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
