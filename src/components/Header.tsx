import React from 'react';

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
  const formatTimecode = (sec: number, targetFps: number) => {
    const totalFrames = Math.floor(sec * targetFps);
    const frames = totalFrames % Math.round(targetFps);
    const totalSecs = Math.floor(sec);
    const s = totalSecs % 60;
    const m = Math.floor((totalSecs / 60) % 60);
    const h = Math.floor(totalSecs / 3600);

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <header className="h-10 bg-[#1f1f1f] border-b border-[#333333] px-3 flex items-center justify-between select-none shrink-0 z-20">
      {/* Left: Title & Status */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold tracking-wide text-[#e6e6e6]">SyncCut</span>

        <div className="h-3.5 w-[1px] bg-[#333333]" />

        {/* Timecode Display */}
        <div className="flex items-center gap-1.5 bg-[#141414] border border-[#2e2e2e] px-2 py-0.5 rounded text-[11px] font-mono">
          <span className="text-[#26b5ff] font-semibold">{formatTimecode(currentTime, fps)}</span>
          <span className="text-[#666666]">@{fps}fps</span>
        </div>

        {/* Status Badge */}
        {status === 'processing' && (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-[#e3b341] bg-[#2d2200] border border-[#bb8009]/40 rounded">
            Đang xử lý...
          </span>
        )}
        {status === 'completed' && (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-[#3fb950] bg-[#0d281e] border border-[#2ea043]/40 rounded">
            XML Sẵn sàng
          </span>
        )}
      </div>

      {/* Right: Functional Actions */}
      <div className="flex items-center gap-2">
        {onLoadDemo && (
          <button
            type="button"
            onClick={onLoadDemo}
            className="px-2.5 py-1 text-xs text-[#d0d0d0] bg-[#2a2a2a] hover:bg-[#333333] border border-[#3d3d3d] rounded transition-colors"
            title="Nạp dữ liệu mẫu để test nhanh"
          >
            Load Demo
          </button>
        )}

        {hasOutput && onRenderVideo && (
          <button
            type="button"
            disabled={isRendering}
            onClick={onRenderVideo}
            className="px-3 py-1 text-xs font-semibold text-[#26b5ff] bg-[#1a2e3b] hover:bg-[#203c4f] border border-[#26b5ff]/40 rounded transition-colors disabled:opacity-50"
          >
            {isRendering ? 'Đang render MP4...' : 'Xem Video MP4'}
          </button>
        )}

        {hasOutput && onOpenOutput && (
          <button
            type="button"
            onClick={onOpenOutput}
            className="px-2.5 py-1 text-xs text-[#b0b0b0] hover:text-white bg-[#2a2a2a] hover:bg-[#333333] border border-[#3d3d3d] rounded transition-colors"
          >
            Thư mục XML
          </button>
        )}

        <button
          type="button"
          onClick={onProcessAndExport}
          disabled={!canProcess || isProcessing}
          className="px-3.5 py-1 bg-[#1473e6] hover:bg-[#2680eb] disabled:bg-[#2a2a2a] disabled:text-[#666666] text-white text-xs font-semibold rounded border border-[#2680eb]/40 transition-colors shadow-sm"
        >
          {isProcessing ? 'Đang cắt...' : 'Xuất Premiere XML'}
        </button>

        <button
          type="button"
          onClick={onReset}
          title="Làm mới dự án"
          className="px-2 py-1 text-xs text-[#808080] hover:text-white bg-[#2a2a2a] hover:bg-[#333333] border border-[#383838] rounded transition-colors"
        >
          Reset
        </button>
      </div>
    </header>
  );
};
