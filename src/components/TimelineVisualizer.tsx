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
      <div className="flex flex-col items-center justify-center p-8 bg-[#141418] border border-[#24242c] rounded-lg min-h-[300px] text-center">
        <div className="w-10 h-10 rounded-full bg-[#1c1c24] border border-[#2c2c38] flex items-center justify-center text-zinc-500 mb-3">
          <ListOrdered className="w-5 h-5" />
        </div>
        <h3 className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-wider mb-1">
          No Alignment Data Yet
        </h3>
        <p className="text-xs text-zinc-500 max-w-sm">
          Select your voiceover MP4 and script .txt file, then click "Align & Generate" to see the visual scene matrix.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-[#141418] border border-[#24242c] rounded-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#22222a]">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <ListOrdered className="w-3.5 h-3.5 text-indigo-400" />
            3. AI Scene Matrix ({segments.length} Scenes)
          </span>
          <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-500" /> Total: {formatTime(totalDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="px-2 py-0.5 rounded bg-indigo-950/40 border border-indigo-800/40 text-indigo-300 flex items-center gap-1">
            <Film className="w-3 h-3" /> {videoCount} Videos
          </span>
          <span className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> {imageCount} Images
          </span>
        </div>
      </div>

      {/* Segment Table */}
      <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-1">
        {segments.map((seg) => (
          <div
            key={seg.id}
            className="flex items-center justify-between p-2.5 bg-[#171720] hover:bg-[#1c1c26] border border-[#272734] rounded transition-colors"
          >
            {/* Left: ID & Time Range */}
            <div className="flex items-center gap-3 min-w-[180px]">
              <span className="w-6 text-[10px] font-mono text-zinc-500 text-center">#{seg.id}</span>
              <div className="flex flex-col">
                <span className="text-xs font-mono text-zinc-300">
                  {formatTime(seg.startTime)} → {formatTime(seg.endTime)}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  Duration: {seg.duration.toFixed(2)}s
                </span>
              </div>
            </div>

            {/* Middle: Script Text */}
            <div className="flex-1 px-3">
              <p className="text-xs text-zinc-200 line-clamp-2 leading-relaxed">{seg.text}</p>
            </div>

            {/* Right: Asset Switcher */}
            <div className="flex items-center gap-2 min-w-[120px] justify-end">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggleAssetType(seg.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium border transition-all ${
                  seg.assetType === 'video'
                    ? 'bg-indigo-950/50 border-indigo-700/60 text-indigo-300 hover:bg-indigo-900/60'
                    : 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60'
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
