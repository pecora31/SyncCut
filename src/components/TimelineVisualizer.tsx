import React from 'react';
import { Film, Image as ImageIcon, Clock, ListOrdered } from 'lucide-react';
import { SentenceSegment } from '../types';

interface TimelineVisualizerProps {
  segments: SentenceSegment[];
  onToggleAssetType: (id: number) => void;
  disabled: boolean;
}

export const TimelineVisualizer: React.FC<TimelineVisualizerProps> = ({
  segments,
  onToggleAssetType,
  disabled,
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const totalDuration = segments.length > 0 ? segments[segments.length - 1].endTime : 0;
  const videoCount = segments.filter((s) => s.assetType === 'video').length;
  const imageCount = segments.filter((s) => s.assetType === 'image').length;

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-[#161b22] border border-[#30363d] rounded-lg min-h-[300px] text-center">
        <div className="w-10 h-10 rounded-full bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#8b949e] mb-3">
          <ListOrdered className="w-5 h-5" />
        </div>
        <h3 className="text-xs font-mono font-semibold text-[#c9d1d9] uppercase tracking-wider mb-1">
          No Alignment Data Yet
        </h3>
        <p className="text-xs text-[#8b949e] max-w-sm">
          Select your voiceover MP4 and script .txt file, then click "Align & Generate" to see the visual scene matrix.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-[#161b22] border border-[#30363d] rounded-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#21262d]">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#c9d1d9] flex items-center gap-2">
            <ListOrdered className="w-3.5 h-3.5 text-[#58a6ff]" />
            3. AI Scene Matrix ({segments.length} Scenes)
          </span>
          <span className="text-[11px] font-mono text-[#8b949e] flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#6e7681]" /> Total: {formatTime(totalDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="px-2 py-0.5 rounded-full bg-[#0d1d30] border border-[#1f6feb]/40 text-[#58a6ff] flex items-center gap-1">
            <Film className="w-3 h-3" /> {videoCount} Videos
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[#0d281e] border border-[#2ea043]/40 text-[#3fb950] flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> {imageCount} Images
          </span>
        </div>
      </div>

      {/* Segment Table */}
      <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-1">
        {segments.map((seg) => (
          <div
            key={seg.id}
            className="flex items-center justify-between p-2.5 bg-[#0d1117] hover:bg-[#1c2128] border border-[#21262d] rounded-md transition-colors"
          >
            {/* Left: ID & Time Range */}
            <div className="flex items-center gap-3 min-w-[180px]">
              <span className="w-6 text-[10px] font-mono text-[#6e7681] text-center">#{seg.id}</span>
              <div className="flex flex-col">
                <span className="text-xs font-mono text-[#c9d1d9]">
                  {formatTime(seg.startTime)} → {formatTime(seg.endTime)}
                </span>
                <span className="text-[10px] font-mono text-[#6e7681]">
                  Duration: {seg.duration.toFixed(2)}s
                </span>
              </div>
            </div>

            {/* Middle: Script Text */}
            <div className="flex-1 px-3">
              <p className="text-xs text-[#f0f6fc] line-clamp-2 leading-relaxed">{seg.text}</p>
            </div>

            {/* Right: Asset Switcher */}
            <div className="flex items-center gap-2 min-w-[120px] justify-end">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggleAssetType(seg.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium border transition-all ${
                  seg.assetType === 'video'
                    ? 'bg-[#0d1d30] border-[#1f6feb]/50 text-[#58a6ff] hover:bg-[#132c4a]'
                    : 'bg-[#0d281e] border-[#2ea043]/50 text-[#3fb950] hover:bg-[#133d2e]'
                } disabled:opacity-50`}
                title="Click to toggle between Video and Image"
              >
                {seg.assetType === 'video' ? (
                  <>
                    <Film className="w-3 h-3" />
                    <span>VIDEO</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-3 h-3" />
                    <span>IMAGE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
