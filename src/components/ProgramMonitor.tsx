import React, { useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Film, Image as ImageIcon } from 'lucide-react';
import { SentenceSegment } from '../types';

interface ProgramMonitorProps {
  segments: SentenceSegment[];
  currentPlaybackTime: number;
  totalDuration: number;
  isPlaying: boolean;
  fps: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
}

export const ProgramMonitor: React.FC<ProgramMonitorProps> = ({
  segments,
  currentPlaybackTime,
  totalDuration,
  isPlaying,
  fps,
  onTogglePlay,
  onSeek,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Find active segment for current playback time
  const activeSegment = segments.find(
    (seg) => currentPlaybackTime >= seg.startTime && currentPlaybackTime <= seg.endTime
  );

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleStep = (delta: number) => {
    const newTime = Math.max(0, Math.min(totalDuration, currentPlaybackTime + delta));
    onSeek(newTime);
  };

  const handleJumpStart = () => onSeek(0);
  const handleJumpEnd = () => onSeek(totalDuration);

  return (
    <div className="flex flex-col h-full bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden select-none">
      {/* Monitor Header */}
      <div className="flex items-center justify-between border-b border-[#30363d] bg-[#0d1117] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Film className="w-3.5 h-3.5 text-[#58a6ff]" />
          <span className="text-xs font-semibold text-[#f0f6fc]">PROGRAM MONITOR</span>
          <span className="text-[10px] font-mono text-[#6e7681]">1920x1080 @{fps}fps</span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[#58a6ff]">{formatSeconds(currentPlaybackTime)}</span>
          <span className="text-[#6e7681]">/</span>
          <span className="text-[#8b949e]">{formatSeconds(totalDuration)}</span>
        </div>
      </div>

      {/* 16:9 Video Canvas Screen */}
      <div
        ref={containerRef}
        className="flex-1 bg-[#050608] relative flex items-center justify-center overflow-hidden min-h-[220px]"
      >
        {/* Visual Frame Simulation */}
        <div className="w-full h-full max-w-[560px] aspect-video bg-[#0d1117] border border-[#21262d] relative flex flex-col items-center justify-center p-6 shadow-inner">
          {activeSegment ? (
            <div className="flex flex-col items-center justify-center text-center gap-3 animate-fade-in w-full">
              {/* Asset Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#21262d]/90 border border-[#30363d] text-xs font-mono font-medium">
                {activeSegment.assetType === 'video' ? (
                  <>
                    <Film className="w-3.5 h-3.5 text-[#58a6ff]" />
                    <span className="text-[#58a6ff]">V1: {activeSegment.sourceMediaName}</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-3.5 h-3.5 text-[#3fb950]" />
                    <span className="text-[#3fb950]">V1: Static Graphic #{activeSegment.id}</span>
                  </>
                )}
                <span className="text-[#6e7681]">({activeSegment.duration.toFixed(1)}s)</span>
              </div>

              {/* Real-time Subtitle Overlay */}
              <div className="bg-black/75 backdrop-blur-sm px-4 py-2 rounded border border-white/10 max-w-md">
                <p className="text-xs md:text-sm font-medium text-white leading-relaxed tracking-wide">
                  "{activeSegment.text}"
                </p>
              </div>

              {/* Progress bar inside scene */}
              <div className="w-36 h-1 bg-[#21262d] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#58a6ff] transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, ((currentPlaybackTime - activeSegment.startTime) / activeSegment.duration) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-[#6e7681] gap-2">
              <Film className="w-8 h-8 opacity-40" />
              <span className="text-xs font-mono">No Active Media at {formatSeconds(currentPlaybackTime)}</span>
            </div>
          )}

          {/* Timecode watermark */}
          <div className="absolute bottom-2 right-2 text-[9px] font-mono text-white/40 bg-black/40 px-1.5 py-0.5 rounded">
            REC ● 00:00
          </div>
        </div>
      </div>

      {/* Monitor Control Bar */}
      <div className="h-10 border-t border-[#30363d] bg-[#0d1117] px-4 flex items-center justify-between">
        {/* Left: Scrubber slider */}
        <div className="flex-1 max-w-[200px] flex items-center gap-2">
          <input
            type="range"
            min="0"
            max={totalDuration || 1}
            step="0.05"
            value={currentPlaybackTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full h-1 bg-[#21262d] rounded appearance-none cursor-pointer accent-[#58a6ff]"
          />
        </div>

        {/* Center: Transport playback controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleJumpStart}
            title="Jump to Start"
            className="p-1 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded transition-colors"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => handleStep(-1.0)}
            title="Step Back 1s"
            className="p-1 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded transition-colors text-[10px] font-mono"
          >
            -1s
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
            className="p-2 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#f0f6fc] rounded-full transition-colors shadow-sm"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => handleStep(1.0)}
            title="Step Forward 1s"
            className="p-1 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded transition-colors text-[10px] font-mono"
          >
            +1s
          </button>

          <button
            type="button"
            onClick={handleJumpEnd}
            title="Jump to End"
            className="p-1 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Loop / Reset */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSeek(0)}
            title="Loop from Start"
            className="p-1 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
