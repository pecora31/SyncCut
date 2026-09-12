import React, { useRef, useState } from 'react';
import { Play, Pause, Film, ZoomIn, ZoomOut, Volume2 } from 'lucide-react';
import { SentenceSegment } from '../types';

interface TimelineTrackViewProps {
  segments: SentenceSegment[];
  currentPlaybackTime: number;
  totalDuration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onToggleAssetType: (id: number) => void;
}

export const TimelineTrackView: React.FC<TimelineTrackViewProps> = ({
  segments,
  currentPlaybackTime,
  totalDuration,
  isPlaying,
  onTogglePlay,
  onSeek,
  onToggleAssetType,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // 0.5 to 3.0
  const rulerRef = useRef<HTMLDivElement>(null);

  const duration = totalDuration > 0 ? totalDuration : 15.0;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  const formatRulerTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate ruler tick marks
  const numTicks = 8;
  const tickInterval = duration / numTicks;

  return (
    <div className="flex flex-col h-full bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden select-none">
      {/* Timeline Header & Tool Controls */}
      <div className="h-9 border-b border-[#30363d] bg-[#0d1117] px-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex items-center gap-1.5 px-2 py-1 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#f0f6fc] rounded font-medium"
          >
            {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <div className="h-3 w-[1px] bg-[#30363d]" />

          <span className="text-[11px] font-mono text-[#8b949e]">
            {segments.length} Scenes Aligned
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
            className="p-1 text-[#8b949e] hover:text-[#f0f6fc]"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.1"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
            className="w-20 h-1 bg-[#21262d] rounded appearance-none cursor-pointer accent-[#58a6ff]"
          />

          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
            className="p-1 text-[#8b949e] hover:text-[#f0f6fc]"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setZoomLevel(1.0)}
            className="px-1.5 py-0.5 text-[10px] font-mono bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-[#f0f6fc] rounded"
          >
            Fit
          </button>
        </div>
      </div>

      {/* Timeline Main Canvas */}
      <div className="flex-1 flex overflow-x-auto overflow-y-hidden relative bg-[#090d13]">
        {/* Track Headers (Left Column) */}
        <div className="w-20 shrink-0 bg-[#0d1117] border-r border-[#30363d] flex flex-col z-10">
          {/* Ruler Header Box */}
          <div className="h-6 border-b border-[#30363d] bg-[#161b22] flex items-center justify-center text-[10px] font-mono text-[#6e7681]">
            TIMELINE
          </div>

          {/* V1 Track Label */}
          <div className="h-16 border-b border-[#21262d] p-1.5 flex flex-col justify-center bg-[#10141a]">
            <div className="flex items-center gap-1 text-[11px] font-mono font-semibold text-[#58a6ff]">
              <Film className="w-3 h-3" /> V1 Video
            </div>
            <span className="text-[9px] font-mono text-[#6e7681]">B-Roll & Img</span>
          </div>

          {/* A1 Track Label */}
          <div className="h-14 p-1.5 flex flex-col justify-center bg-[#10141a]">
            <div className="flex items-center gap-1 text-[11px] font-mono font-semibold text-[#3fb950]">
              <Volume2 className="w-3 h-3" /> A1 Audio
            </div>
            <span className="text-[9px] font-mono text-[#6e7681]">Voice Sync</span>
          </div>
        </div>

        {/* Tracks Content Area (Scrollable by zoom) */}
        <div
          ref={rulerRef}
          onClick={handleTimelineClick}
          className="flex-1 relative cursor-pointer min-w-full"
          style={{ width: `${zoomLevel * 100}%` }}
        >
          {/* Timeline Ruler (Top 24px) */}
          <div className="h-6 border-b border-[#30363d] bg-[#0d1117] relative flex items-center">
            {Array.from({ length: numTicks + 1 }).map((_, i) => {
              const tickTime = i * tickInterval;
              const leftPercent = (tickTime / duration) * 100;
              return (
                <div
                  key={i}
                  className="absolute flex flex-col items-start"
                  style={{ left: `${leftPercent}%` }}
                >
                  <div className="h-2 w-[1px] bg-[#30363d]" />
                  <span className="text-[9px] font-mono text-[#6e7681] -translate-x-1/2 mt-0.5">
                    {formatRulerTime(tickTime)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Track V1: Visual Segment Blocks */}
          <div className="h-16 border-b border-[#21262d] relative bg-[#0d1117]/60 p-1 flex items-center">
            {segments.length === 0 ? (
              <div className="w-full text-center text-xs text-[#6e7681] italic">
                No clips on Track V1 yet.
              </div>
            ) : (
              segments.map((seg) => {
                const leftPercent = (seg.startTime / duration) * 100;
                const widthPercent = (seg.duration / duration) * 100;
                const isCurrent = currentPlaybackTime >= seg.startTime && currentPlaybackTime <= seg.endTime;

                return (
                  <div
                    key={seg.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(seg.startTime);
                    }}
                    className={`absolute top-1 bottom-1 rounded border px-2 py-1 flex flex-col justify-between overflow-hidden transition-all group ${
                      seg.assetType === 'video'
                        ? isCurrent
                          ? 'bg-[#1b324f] border-[#58a6ff] text-[#f0f6fc] shadow-sm'
                          : 'bg-[#112236] border-[#1f6feb]/60 text-[#c9d1d9] hover:border-[#58a6ff]'
                        : isCurrent
                        ? 'bg-[#133827] border-[#3fb950] text-[#f0f6fc] shadow-sm'
                        : 'bg-[#0d261a] border-[#2ea043]/60 text-[#c9d1d9] hover:border-[#3fb950]'
                    }`}
                    style={{
                      left: `${leftPercent}%`,
                      width: `${Math.max(1, widthPercent)}%`,
                    }}
                  >
                    {/* Clip Header */}
                    <div className="flex items-center justify-between gap-1 text-[10px] font-mono leading-none">
                      <span className="font-semibold truncate">
                        #{seg.id} {seg.assetType === 'video' ? 'VIDEO' : 'IMAGE'}
                      </span>

                      {/* Quick Asset Toggle Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleAssetType(seg.id);
                        }}
                        className={`px-1 py-0.5 rounded text-[8px] font-bold border transition-colors opacity-90 hover:opacity-100 ${
                          seg.assetType === 'video'
                            ? 'bg-[#1f6feb] text-white border-transparent'
                            : 'bg-[#2ea043] text-white border-transparent'
                        }`}
                        title="Click to toggle Video/Image"
                      >
                        {seg.assetType === 'video' ? 'V' : 'IMG'}
                      </button>
                    </div>

                    {/* Clip Text Preview */}
                    <p className="text-[10px] truncate text-white/80 font-sans">{seg.text}</p>
                  </div>
                );
              })
            )}
          </div>

          {/* Track A1: Voiceover Waveform Block */}
          <div className="h-14 relative bg-[#090d13] p-1 flex items-center">
            {totalDuration > 0 && (
              <div
                className="absolute top-1 bottom-1 left-0 right-0 bg-[#0d281e] border border-[#2ea043]/50 rounded px-3 flex items-center justify-between overflow-hidden"
              >
                {/* Simulated Audio Waveform Bar Graphics */}
                <div className="flex items-center gap-0.5 w-full h-4 opacity-50">
                  {Array.from({ length: 60 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-[#3fb950] rounded-full"
                      style={{
                        height: `${Math.max(20, (Math.sin(i * 0.4) * 40 + 50))}%`,
                      }}
                    />
                  ))}
                </div>

                <span className="absolute left-3 text-[10px] font-mono font-medium text-[#3fb950]">
                  🎙️ A1: Voiceover Sync Stream ({totalDuration.toFixed(1)}s)
                </span>
              </div>
            )}
          </div>

          {/* Scrubber Playhead Line & Needle */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-30 transition-all flex flex-col items-center"
            style={{
              left: `${(currentPlaybackTime / duration) * 100}%`,
            }}
          >
            {/* Playhead Triangle Head */}
            <div className="w-3 h-3 bg-[#58a6ff] rotate-45 -translate-y-1.5 shadow-md" />
            {/* Playhead Red Needle Line */}
            <div className="w-[2px] h-full bg-[#58a6ff] shadow-[0_0_8px_rgba(88,166,255,0.8)]" />
          </div>
        </div>
      </div>
    </div>
  );
};
