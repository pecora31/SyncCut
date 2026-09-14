import React, { useRef, useState, useCallback } from 'react';
import { SentenceSegment } from '../types';
import { timeStringToSeconds } from '../utils/time';

interface TimelineTrackViewProps {
  segments: SentenceSegment[];
  currentPlaybackTime: number;
  totalDuration: number;
  isPlaying?: boolean;
  fps?: number;
  onTogglePlay?: () => void;
  onSeek: (time: number) => void;
  onToggleAssetType: (id: number) => void;
  onSplitAtPlayhead?: () => void;
  onMarkIn?: () => void;
  onMarkOut?: () => void;
  startTime?: string;
  endTime?: string;
  enableCrop?: boolean;
}

function formatTimecode(totalSec: number, fps: number = 30): string {
  const safe = Math.max(0, totalSec);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * fps);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

function formatRulerTime(sec: number): string {
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const TimelineTrackView: React.FC<TimelineTrackViewProps> = ({
  segments,
  currentPlaybackTime,
  totalDuration,
  fps = 30,
  onSeek,
  onToggleAssetType,
  onSplitAtPlayhead,
  onMarkIn,
  onMarkOut,
  startTime,
  endTime,
  enableCrop,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const tracksContentRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef<boolean>(false);

  const duration = totalDuration > 0 ? totalDuration : 15.0;

  const handleWheel = (e: React.WheelEvent) => {
    if (e.altKey || e.ctrlKey) {
      e.preventDefault();
      setZoomLevel((z) => Math.max(0.5, Math.min(3.0, z - e.deltaY * 0.002)));
    }
  };

  const seekFromMouseEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!tracksContentRef.current) return;
      const rect = tracksContentRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    isScrubbingRef.current = true;
    seekFromMouseEvent(e);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isScrubbingRef.current) {
        seekFromMouseEvent(moveEvent);
      }
    };

    const handleMouseUp = () => {
      isScrubbingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const numTicks = Math.max(6, Math.min(24, Math.floor(duration / 2)));
  const tickInterval = duration / numTicks;

  return (
    <div className="flex flex-col h-full bg-[#1c1c1c] border-t border-[#2e2e2e] select-none text-xs overflow-hidden">
      {/* 1. Timeline Panel Header Bar */}
      <div className="h-7 bg-[#212121] border-b border-[#2d2d2d] px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="px-2 py-0.5 bg-[#1c1c1c] border-t border-l border-r border-[#3a3a3a] text-white font-medium text-[11px] rounded-t-sm">
            Timeline: SyncCut Sequence
          </div>

          {/* Timeline Editing Tools Cluster (Split / Razor, Mark In, Mark Out) */}
          <div className="flex items-center gap-0.5 ml-2 bg-[#181818] px-1 py-0.5 rounded border border-[#2e2e2e]">
            {/* Split / Razor Button */}
            <button
              type="button"
              onClick={onSplitAtPlayhead}
              title="Split Video at Playhead (C)"
              className="w-5 h-5 flex items-center justify-center rounded text-[#a0a0a0] hover:text-white hover:bg-[#2c2c2c] transition-colors cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <line x1="20" y1="4" x2="8.12" y2="15.88" />
                <line x1="14.47" y1="14.48" x2="20" y2="20" />
                <line x1="8.12" y1="8.12" x2="12" y2="12" />
              </svg>
            </button>

            {/* Divider */}
            <div className="h-3 w-[1px] bg-[#333333] mx-0.5" />

            {/* Mark In Button */}
            <button
              type="button"
              onClick={onMarkIn}
              title="Mark In (I)"
              className="w-5 h-5 flex items-center justify-center rounded text-[#a0a0a0] hover:text-white hover:bg-[#2c2c2c] transition-colors cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2h3.5v2H5.5v8h2v2H4V2z M8.5 4.5l4.5 3.5-4.5 3.5V4.5z" />
              </svg>
            </button>

            {/* Mark Out Button */}
            <button
              type="button"
              onClick={onMarkOut}
              title="Mark Out (O)"
              className="w-5 h-5 flex items-center justify-center rounded text-[#a0a0a0] hover:text-white hover:bg-[#2c2c2c] transition-colors cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12 2H8.5v2h2v8h-2v2H12V2z M7.5 4.5L3 8l4.5 3.5V4.5z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Right: Playhead Timecode */}
        <div className="flex items-center gap-2 font-mono">
          <span className="text-xs font-bold text-white bg-[#141414] px-2 py-0.5 rounded border border-[#333333]">
            {formatTimecode(currentPlaybackTime, fps)}
          </span>
        </div>
      </div>

      {/* 2. Timeline Tracks Body */}
      <div className="flex-1 flex overflow-x-auto overflow-y-auto relative bg-[#141414]">
        {/* Left Track Headers (Fixed Column) */}
        <div className="w-28 shrink-0 bg-[#1e1e1e] border-r border-[#2e2e2e] flex flex-col z-20 shadow-md">
          {/* Ruler Corner Header */}
          <div className="h-6 border-b border-[#2e2e2e] bg-[#242424] flex items-center justify-between px-2 text-[9px] font-mono text-[#808080]">
            <span>TRACK</span>
            <span>SYNC</span>
          </div>

          {/* V2 Video Track Header */}
          <div className="h-14 border-b border-[#2a2a2a] p-1.5 flex flex-col justify-center bg-[#1c1c1c]">
            <div className="flex items-center justify-between text-[11px] font-mono font-semibold text-[#a0a0a0]">
              <span>V2</span>
              <div className="flex items-center gap-1 text-[9px] text-[#666666]">
                <span>L</span>
                <span>V</span>
              </div>
            </div>
            <span className="text-[9px] text-[#555555]">Overlay</span>
          </div>

          {/* V1 Video Track Header (Main Visual Track) */}
          <div className="h-20 border-b border-[#2a2a2a] p-1.5 flex flex-col justify-center bg-[#202020]">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-white">
              <span>V1</span>
              <div className="flex items-center gap-1 text-[9px] text-[#808080]">
                <span>L</span>
                <span>V</span>
              </div>
            </div>
            <span className="text-[9px] text-[#707070]">B-Roll & Visuals</span>
          </div>

          {/* A1 Audio Track Header (Voiceover Track) */}
          <div className="h-16 border-b border-[#2a2a2a] p-1.5 flex flex-col justify-center bg-[#202020]">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-white">
              <span>A1</span>
              <div className="flex items-center gap-1 text-[9px] text-[#808080]">
                <span>M</span>
                <span>S</span>
              </div>
            </div>
            <span className="text-[9px] text-[#707070]">Voiceover</span>
          </div>

          {/* A2 Audio Track Header */}
          <div className="h-12 p-1.5 flex flex-col justify-center bg-[#1c1c1c]">
            <div className="flex items-center justify-between text-[11px] font-mono font-semibold text-[#a0a0a0]">
              <span>A2</span>
              <div className="flex items-center gap-1 text-[9px] text-[#666666]">
                <span>M</span>
                <span>S</span>
              </div>
            </div>
            <span className="text-[9px] text-[#555555]">Music</span>
          </div>
        </div>

        {/* Right Tracks Content Area (Scrollable / Zoomable) */}
        <div
          ref={tracksContentRef}
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
          className="flex-1 relative cursor-pointer min-w-full flex flex-col"
          style={{ width: `${zoomLevel * 100}%` }}
        >
          {/* Timecode Ruler Bar */}
          <div className="h-6 border-b border-[#2e2e2e] bg-[#1a1a1a] relative flex items-center shrink-0">
            {Array.from({ length: numTicks + 1 }).map((_, i) => {
              const tickTime = i * tickInterval;
              const leftPercent = (tickTime / duration) * 100;
              return (
                <div
                  key={i}
                  className="absolute flex flex-col items-start pointer-events-none"
                  style={{ left: `${leftPercent}%` }}
                >
                  <div className="h-2 w-[1px] bg-[#3a3a3a]" />
                  <span className="text-[8px] font-mono text-[#777777] -translate-x-1/2 mt-0.5">
                    {formatRulerTime(tickTime)}
                  </span>
                </div>
              );
            })}

            {/* In / Out Markers on Ruler */}
            {enableCrop && startTime && endTime && (
              <>
                <div
                  className="absolute top-0 bottom-0 pointer-events-none z-20"
                  style={{ left: `${(timeStringToSeconds(startTime) / duration) * 100}%` }}
                >
                  <div className="w-1.5 h-full border-l-2 border-white/90 bg-white/10" />
                </div>
                <div
                  className="absolute top-0 bottom-0 pointer-events-none z-20"
                  style={{ left: `${(timeStringToSeconds(endTime) / duration) * 100}%` }}
                >
                  <div className="w-1.5 h-full border-r-2 border-white/90 bg-white/10 -translate-x-full" />
                </div>
              </>
            )}
          </div>

          {/* V2 Empty Track Lane */}
          <div className="h-14 border-b border-[#242424] relative bg-[#131313] flex items-center" />

          {/* V1 Visual Track Lane (Scenes & Clips) */}
          <div className="h-20 border-b border-[#242424] relative bg-[#161616] p-1 flex items-center">
            {segments.length === 0 ? (
              <div className="w-full text-center text-[11px] text-[#555555] font-mono">
                No aligned clips on Track V1
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
                    className={`absolute top-1 bottom-1 rounded-sm border px-2 py-1 flex flex-col justify-between overflow-hidden transition-colors select-none shadow-sm ${
                      isCurrent
                        ? 'bg-[#333333] border-white text-white z-10'
                        : 'bg-[#252525] border-[#404040] text-[#d0d0d0] hover:border-[#666666]'
                    }`}
                    style={{
                      left: `${leftPercent}%`,
                      width: `${Math.max(1.2, widthPercent)}%`,
                    }}
                  >
                    {/* Scene Tag + Asset Type Toggle */}
                    <div className="flex items-center justify-between gap-1 text-[9px] font-mono leading-none">
                      <span className="font-semibold truncate">
                        #{seg.id} {seg.assetType === 'video' ? 'VIDEO' : 'IMG'} ({seg.duration.toFixed(1)}s)
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleAssetType(seg.id);
                        }}
                        className="px-1 py-0.5 rounded text-[8px] font-bold border border-[#555555] bg-[#1f1f1f] hover:bg-[#353535] text-white transition-colors"
                        title="Toggle Video / Image"
                      >
                        {seg.assetType === 'video' ? 'V' : 'IMG'}
                      </button>
                    </div>

                    {/* Subtitle Ground Truth Snippet */}
                    <p className="text-[10px] truncate text-white/90 font-sans leading-tight">
                      {seg.text}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* A1 Audio Waveform Lane */}
          <div className="h-16 border-b border-[#242424] relative bg-[#131313] p-1 flex items-center">
            {totalDuration > 0 && (
              <div className="absolute top-1 bottom-1 left-0 right-0 bg-[#222222] border border-[#333333] rounded px-3 flex items-center justify-between overflow-hidden shadow-inner">
                {/* Visual Waveform Simulation */}
                <div className="flex items-center gap-0.5 w-full h-5 opacity-60">
                  {Array.from({ length: 80 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-[#888888] rounded-full"
                      style={{
                        height: `${Math.max(15, (Math.sin(i * 0.35) * 45 + 50))}%`,
                      }}
                    />
                  ))}
                </div>

                <span className="absolute left-3 text-[10px] font-mono font-medium text-white drop-shadow">
                  A1: Voiceover Track ({totalDuration.toFixed(1)}s)
                </span>
              </div>
            )}
          </div>

          {/* A2 Empty Music Track Lane */}
          <div className="h-12 relative bg-[#121212] flex items-center" />

          {/* Playhead CTI Needle (Spanning full height across tracks) */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-30 flex flex-col items-center"
            style={{
              left: `${(currentPlaybackTime / duration) * 100}%`,
            }}
          >
            {/* Pentagon Pointer pointing down */}
            <div
              className="w-3 h-3 bg-white shadow-md -translate-y-0.5"
              style={{
                clipPath: 'polygon(0% 0%, 100% 0%, 100% 60%, 50% 100%, 0% 60%)',
              }}
            />
            {/* White Hairline through all tracks */}
            <div className="w-[1.5px] h-full bg-white opacity-95 shadow" />
          </div>
        </div>
      </div>
    </div>
  );
};
export default TimelineTrackView;
