import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { SentenceSegment, MediaAsset } from '../types';
import { safeConvertFileSrc } from '../utils/mediaUtils';

interface ProgramMonitorProps {
  segments: SentenceSegment[];
  currentPlaybackTime: number;
  totalDuration: number;
  isPlaying: boolean;
  fps?: number;
  previewAsset?: MediaAsset | null;
  onTogglePlay: () => void;
  onSeek: (time: number, autoPlay?: boolean) => void;
  onTimeUpdate?: (time: number) => void;
  onLoadToPreview?: (asset: MediaAsset) => void;
  onClearPreview?: () => void;
  onAddAssets?: (assets: MediaAsset[]) => void;
  hoverDropZone?: string | null;
  onSelectVoice?: (path: string) => void;
  onSelectScript?: (path: string) => void;
}

function formatPlaybackDisplay(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
}

export const ProgramMonitor: React.FC<ProgramMonitorProps> = ({
  segments,
  currentPlaybackTime,
  totalDuration,
  isPlaying,
  previewAsset,
  onTogglePlay,
  onSeek,
  onTimeUpdate,
  onLoadToPreview,
  onClearPreview,
  onAddAssets,
  hoverDropZone,
  onSelectVoice,
  onSelectScript,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const scrubberTrackRef = useRef<HTMLDivElement | null>(null);
  const volumeContainerRef = useRef<HTMLDivElement | null>(null);

  // Drag-and-drop state for dropping assets into preview monitor
  const [isDragOver, setIsDragOver] = useState(false);

  // Aspect ratio & Frame Fit: default to 16:9 as standard video scale
  const [frameFitMode, setFrameFitMode] = useState<'auto' | 'fill' | '16:9' | '9:16' | '1:1' | '4:3'>('16:9');
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const [screenSize, setScreenSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Dynamically compute screen frame dimensions: always scales directly to video aspect ratio
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const pad = 16;
      const availW = Math.max(0, rect.width - pad);
      const availH = Math.max(0, rect.height - pad);

      if (availW <= 0 || availH <= 0) return;

      if (frameFitMode === 'fill') {
        setScreenSize({ width: availW, height: availH });
        return;
      }

      // If video has intrinsic aspect ratio, scale directly to video dimensions!
      let ratio = 16 / 9;
      if (videoAspectRatio && videoAspectRatio > 0) {
        ratio = videoAspectRatio;
      } else if (frameFitMode === '9:16') {
        ratio = 9 / 16;
      } else if (frameFitMode === '1:1') {
        ratio = 1 / 1;
      } else if (frameFitMode === '4:3') {
        ratio = 4 / 3;
      } else {
        ratio = 16 / 9;
      }

      if (availW / availH > ratio) {
        const h = availH;
        const w = Math.round(h * ratio);
        setScreenSize({ width: w, height: h });
      } else {
        const w = availW;
        const h = Math.round(w / ratio);
        setScreenSize({ width: w, height: h });
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [frameFitMode, videoAspectRatio]);

  // Volume & Audio State
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  // Scrubber Dragging State
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  // Real video duration detected directly by HTML5 video engine
  const [internalVideoDuration, setInternalVideoDuration] = useState<number>(0);
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);

  // Distinguish between Direct Asset Preview Mode vs Assembled Timeline Mode
  const isDirectAssetPreview = Boolean(previewAsset);
  const isPreviewVideo = Boolean(
    previewAsset && (
      previewAsset.fileType === 'video' ||
      /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(previewAsset.name)
    )
  );

  // Duration computation
  const duration = useMemo(() => {
    if (isDirectAssetPreview) {
      if (previewAsset?.duration && previewAsset.duration > 0) return previewAsset.duration;
      if (internalVideoDuration > 0) return internalVideoDuration;
      return 0;
    }
    return totalDuration > 0 ? totalDuration : (segments.length > 0 ? Math.max(...segments.map((s) => s.endTime)) : 0);
  }, [isDirectAssetPreview, previewAsset, internalVideoDuration, totalDuration, segments]);

  // Active segment only applies in timeline mode
  const activeSegment = !isDirectAssetPreview && segments.length > 0
    ? segments.find((seg) => currentPlaybackTime >= seg.startTime && currentPlaybackTime <= seg.endTime) || segments[segments.length - 1]
    : undefined;

  // Active video path
  const activeVideoPath = isDirectAssetPreview
    ? (isPreviewVideo ? previewAsset!.path : undefined)
    : activeSegment?.sourceMediaPath;

  const hasMedia = Boolean(activeVideoPath || (previewAsset && previewAsset.fileType === 'voice') || segments.length > 0);

  // Reset internal duration and error when video source changes
  useEffect(() => {
    setInternalVideoDuration(0);
    setVideoLoadError(null);
  }, [activeVideoPath]);

  // Clean up video playback on unmount
  useEffect(() => {
    return () => {
      if (localVideoRef.current) {
        localVideoRef.current.pause();
      }
    };
  }, []);

  // Sync play/pause state
  useEffect(() => {
    if (!localVideoRef.current) return;
    if (isPlaying && localVideoRef.current.paused) {
      const p = localVideoRef.current.play();
      if (p !== undefined) {
        p.catch((err) => {
          console.warn('Effect play failed, retrying muted:', err);
          if (localVideoRef.current) {
            localVideoRef.current.muted = true;
            setIsMuted(true);
            localVideoRef.current.play().catch((e) => {
              console.error('Effect play muted retry failed:', e);
              setVideoLoadError(`Playback blocked: ${e.message || 'Auto-play policy restriction'}`);
            });
          }
        });
      }
    } else if (!isPlaying && !localVideoRef.current.paused) {
      localVideoRef.current.pause();
    }
  }, [isPlaying]);

  // Sync video time:
  // In Direct Asset Preview: the video element is the source of truth; only seek if paused and drifted (user clicked seek).
  // In Timeline Sequence Mode: seek to active segment sourceIn + offset.
  useEffect(() => {
    if (!localVideoRef.current || isDraggingRef.current) return;
    if (!activeVideoPath) return;

    if (isDirectAssetPreview) {
      if (!isPlaying && Math.abs(localVideoRef.current.currentTime - currentPlaybackTime) > 0.1) {
        localVideoRef.current.currentTime = Math.max(0, currentPlaybackTime);
      }
    } else if (activeSegment) {
      const segOffset = Math.max(0, currentPlaybackTime - activeSegment.startTime);
      const targetTime = (activeSegment.sourceIn || 0) + segOffset;
      if (Math.abs(localVideoRef.current.currentTime - targetTime) > 0.25) {
        localVideoRef.current.currentTime = Math.max(0, targetTime);
      }
    }
  }, [currentPlaybackTime, isPlaying, isDirectAssetPreview, activeSegment, activeVideoPath]);

  // Volume synchronization
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.volume = isMuted ? 0 : volume;
      localVideoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Keyboard shortcut: Escape to close preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;
      if (e.key === 'Escape' && previewAsset && onClearPreview) {
        e.preventDefault();
        onClearPreview();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewAsset, onClearPreview]);

  const handleStep = (delta: number) => {
    if (duration <= 0) return;
    const nextTime = Math.max(0, Math.min(duration, currentPlaybackTime + delta));
    if (localVideoRef.current && isDirectAssetPreview) {
      localVideoRef.current.currentTime = nextTime;
    }
    onSeek(nextTime);
  };

  const togglePlayback = () => {
    if (!hasMedia) return;
    const video = localVideoRef.current;
    if (video && isDirectAssetPreview) {
      if (video.paused) {
        if (video.ended || (duration > 0 && video.currentTime >= duration)) {
          video.currentTime = 0;
          onSeek(0);
        }
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (!isPlaying) onTogglePlay();
            })
            .catch((err) => {
              console.warn('Playback with audio blocked by policy, trying muted:', err);
              video.muted = true;
              setIsMuted(true);
              video.play()
                .then(() => {
                  if (!isPlaying) onTogglePlay();
                })
                .catch((e) => {
                  console.error('Video play failed:', e);
                  setVideoLoadError(`Cannot play video: ${e.message || 'Playback blocked'}`);
                });
            });
        } else {
          if (!isPlaying) onTogglePlay();
        }
      } else {
        video.pause();
        if (isPlaying) onTogglePlay();
      }
    } else {
      if (currentPlaybackTime >= duration && duration > 0) {
        onSeek(0);
      }
      onTogglePlay();
    }
  };

  // Video Display Click & Double-Click Handlers (YouTube style toggle play/pause, no zoom)
  const handleVideoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    togglePlayback();
  };

  const handleVideoDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Strictly prevent auto-zoom or fullscreen per project rule
  };

  // Dragging Handlers for Scrubber
  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || !scrubberTrackRef.current) return;
    const rect = scrubberTrackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    isDraggingRef.current = true;
    setIsDragging(true);

    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * duration;
    if (localVideoRef.current && isDirectAssetPreview) {
      localVideoRef.current.currentTime = targetTime;
    }
    // Per user requirement: "Khi tôi nhấn chọn 1 điểm trên timeline thì video sẽ chơi tiếp bắt đầu từ điểm đó"
    onSeek(targetTime, true);
  };

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current || !scrubberTrackRef.current || !duration) return;
    const rect = scrubberTrackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * duration;
    if (localVideoRef.current && isDirectAssetPreview) {
      localVideoRef.current.currentTime = targetTime;
    }
    onSeek(targetTime);
  }, [duration, onSeek, isDirectAssetPreview]);

  const handleWindowMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      // Ensure playback starts / continues from release point
      if (!isPlaying) {
        onTogglePlay();
      }
    }
  }, [isPlaying, onTogglePlay]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
      };
    }
  }, [isDragging, handleWindowMouseMove, handleWindowMouseUp]);

  // Volume slider click outside
  useEffect(() => {
    if (!showVolumeSlider) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (volumeContainerRef.current && !volumeContainerRef.current.contains(e.target as Node)) {
        setShowVolumeSlider(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showVolumeSlider]);

  const handleVolumePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (rect.bottom - e.clientY) / rect.height));
    setVolume(ratio);
    setIsMuted(ratio === 0);
  };

  const handleVolumePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (rect.bottom - e.clientY) / rect.height));
      setVolume(ratio);
      setIsMuted(ratio === 0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // 1. Native Windows Explorer file drop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedAssets: MediaAsset[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        const fullPath = (file as any).path || (file as any).webkitRelativePath;
        if (!fullPath) continue;

        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let fileType: 'voice' | 'script' | 'video' | 'image' = 'video';
        if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) {
          fileType = 'voice';
        } else if (['txt', 'json', 'srt', 'vtt', 'md'].includes(ext)) {
          fileType = 'script';
        } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg'].includes(ext)) {
          fileType = 'image';
        }

        droppedAssets.push({
          id: `file_${Date.now()}_${i}`,
          name: file.name,
          path: fullPath,
          fileType,
          sizeBytes: file.size,
        });
      }

      if (droppedAssets.length > 0) {
        onAddAssets?.(droppedAssets);
        const primary = droppedAssets[0];
        if (primary.fileType === 'voice') {
          onSelectVoice?.(primary.path);
        } else if (primary.fileType === 'script') {
          onSelectScript?.(primary.path);
        } else {
          onLoadToPreview?.(primary);
        }
      }
      return;
    }

    // 2. Internal Media Pool asset drag
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (dataStr) {
        const asset: MediaAsset = JSON.parse(dataStr);
        if (asset.fileType === 'voice') {
          onSelectVoice?.(asset.path);
        } else if (asset.fileType === 'script') {
          onSelectScript?.(asset.path);
        } else {
          onLoadToPreview?.(asset);
        }
      }
    } catch (err) {
      console.error('Failed to parse dropped asset:', err);
    }
  };

  const currentPct = duration > 0 ? Math.max(0, Math.min(100, (currentPlaybackTime / duration) * 100)) : 0;

  // Dynamic Aspect Ratio calculation based on frameFitMode & detected video dimensions
  const computedAspectRatio = useMemo(() => {
    switch (frameFitMode) {
      case '16:9':
        return '16 / 9';
      case '9:16':
        return '9 / 16';
      case '1:1':
        return '1 / 1';
      case '4:3':
        return '4 / 3';
      case 'fill':
        return undefined;
      case 'auto':
      default:
        if (videoAspectRatio && videoAspectRatio > 0) {
          return `${videoAspectRatio}`;
        }
        return '16 / 9';
    }
  }, [frameFitMode, videoAspectRatio]);

  return (
    <div className="flex flex-col h-full bg-[#181818] select-none text-xs rounded-none overflow-hidden">
      {/* Video Screen Canvas */}
      <div
        ref={canvasContainerRef}
        data-drop-zone="preview"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex-1 bg-[#0c0c0c] relative flex items-center justify-center overflow-hidden p-2 min-h-0 transition-colors ${
          isDragOver || hoverDropZone === 'preview' ? 'ring-2 ring-inset ring-white/70 bg-[#151515]' : ''
        }`}
      >
        <div
          className="relative flex items-center justify-center overflow-hidden bg-black z-10"
          style={{
            width: screenSize.width > 0 ? `${screenSize.width}px` : undefined,
            height: screenSize.height > 0 ? `${screenSize.height}px` : undefined,
            aspectRatio: screenSize.width > 0 ? undefined : (computedAspectRatio || '16 / 9'),
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        >
          {previewAsset?.fileType === 'image' ? (
            <div className="w-full h-full relative flex items-center justify-center bg-black overflow-hidden">
              <img
                src={safeConvertFileSrc(previewAsset.path)}
                alt={previewAsset.name}
                className={`w-full h-full ${
                  frameFitMode === 'fill' ? 'object-cover' : 'object-contain'
                } pointer-events-none select-none`}
              />
            </div>
          ) : activeVideoPath ? (
            <div
              className="w-full h-full relative cursor-pointer flex items-center justify-center bg-black overflow-hidden"
              onClick={handleVideoClick}
              onDoubleClick={handleVideoDoubleClick}
            >
              <video
                ref={localVideoRef}
                key={activeVideoPath}
                src={safeConvertFileSrc(activeVideoPath)}
                onLoadedMetadata={(e) => {
                  setVideoLoadError(null);
                  const target = e.currentTarget;
                  if (target.videoWidth && target.videoHeight) {
                    setVideoAspectRatio(target.videoWidth / target.videoHeight);
                  }
                  if (target.duration && !isNaN(target.duration) && target.duration > 0) {
                    setInternalVideoDuration(target.duration);
                  }
                }}
                onError={(e) => {
                  const mediaErr = e.currentTarget.error;
                  console.error('Video error event:', mediaErr, activeVideoPath);
                  const msg = mediaErr
                    ? `Cannot load video (${mediaErr.code}): ${mediaErr.message || 'Format or access restriction'}`
                    : 'Video load failed';
                  setVideoLoadError(msg);
                }}
                onTimeUpdate={(e) => {
                  if (isDirectAssetPreview && !isDraggingRef.current && isPlaying) {
                    onTimeUpdate?.(e.currentTarget.currentTime);
                  }
                }}
                onEnded={() => {
                  if (isPlaying) {
                    onTogglePlay();
                  }
                }}
                className={`w-full h-full ${
                  frameFitMode === 'fill' ? 'object-cover' : 'object-contain'
                } select-none`}
                playsInline
              />

              {videoLoadError && (
                <div className="absolute inset-0 bg-[#0d0d0d]/90 flex flex-col items-center justify-center p-4 text-center z-30">
                  <span className="text-xs text-white font-mono font-medium">Video Playback Error</span>
                  <span className="text-[11px] text-[#888888] font-mono mt-1 max-w-sm truncate">{videoLoadError}</span>
                  <span className="text-[10px] text-[#555555] font-mono mt-0.5 max-w-md truncate">{activeVideoPath}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoLoadError(null);
                      if (localVideoRef.current) {
                        localVideoRef.current.load();
                      }
                    }}
                    className="mt-3 px-3 py-1 bg-[#222222] hover:bg-[#333333] border border-[#444444] rounded text-white text-xs font-mono transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!isPlaying && !videoLoadError && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-black/60 border border-white/40 flex items-center justify-center shadow-lg">
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="white" className="ml-0.5">
                      <path d="M4 3l9 5-9 5V3z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center text-center p-4 bg-[#111111] select-none"
              onDoubleClick={handleVideoDoubleClick}
            >
              <span className="text-xs text-[#888888] font-mono">
                {isDragOver ? 'Drop media file to preview & mount' : 'No Media Loaded'}
              </span>
              <span className="text-[10px] text-[#555555] font-mono mt-1">
                Drag any video, voice, or script file here
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3. CLEAN VIDEO CONTROLLER BAR */}
      <div className="px-3 py-1.5 bg-[#1a1a1a] border-t border-[#2a2a2a] flex flex-col gap-1 select-none relative overflow-visible shrink-0">
        {/* Monitor Header: Left Timecode + Frame Selector | Right Duration */}
        <div className="flex items-center justify-between text-[11px] font-mono px-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold tracking-wider text-xs bg-[#121212] px-1.5 py-0.5 rounded border border-[#2e2e2e]">
              {formatPlaybackDisplay(currentPlaybackTime)}
            </span>

            {/* Frame Fit Mode Selector */}
            <div className="flex items-center gap-1 bg-[#121212] px-1.5 py-0.5 rounded border border-[#2e2e2e] text-[10px]">
              <span className="text-[#757575]">Frame:</span>
              <select
                value={frameFitMode}
                onChange={(e) => setFrameFitMode(e.target.value as any)}
                className="bg-transparent text-white outline-none cursor-pointer text-[10px] font-mono"
                title="Aspect ratio frame fit"
              >
                <option value="auto" className="bg-[#1e1e1e] text-white">Auto (Native)</option>
                <option value="fill" className="bg-[#1e1e1e] text-white">Fill Screen</option>
                <option value="16:9" className="bg-[#1e1e1e] text-white">16:9</option>
                <option value="9:16" className="bg-[#1e1e1e] text-white">9:16</option>
                <option value="1:1" className="bg-[#1e1e1e] text-white">1:1</option>
                <option value="4:3" className="bg-[#1e1e1e] text-white">4:3</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#808080] font-mono">
            <span>{formatPlaybackDisplay(duration)}</span>
          </div>
        </div>

        {/* Scrubber Track Bar */}
        <div className="relative py-1 px-1">
          <div
            ref={scrubberTrackRef}
            onMouseDown={handleTrackMouseDown}
            className="w-full h-2.5 bg-[#121212] border border-[#303030] rounded-xs relative cursor-pointer select-none overflow-hidden"
            title="Click or drag to scrub"
          >
            {/* Progress Fill */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-[#404040]"
              style={{ width: `${currentPct}%` }}
            />

            {/* Playhead Needle Indicator */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow-sm -translate-x-1/2 pointer-events-none z-20"
              style={{ left: `${currentPct}%` }}
            />
          </div>
        </div>

        {/* Transport Controls Bar: Playback Centered, Volume Docked at Right Corner */}
        <div className="relative flex items-center justify-center py-1 px-2">
          {/* Central Playback Controls */}
          <div className="flex items-center gap-2">
            {/* Step Back 5s */}
            <button
              type="button"
              onClick={hasMedia ? () => handleStep(-5.0) : undefined}
              disabled={!hasMedia}
              title="Step Backward 5s (Left Arrow / J)"
              className={`w-9 h-9 flex items-center justify-center text-[#aaaaaa] hover:text-white hover:bg-[#282828] rounded transition-colors ${
                !hasMedia ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 3h2v10H4V3z M13 4.5L7.5 8 13 11.5V4.5z" />
              </svg>
            </button>

            {/* Play / Pause - Main Central Button */}
            <button
              type="button"
              onClick={hasMedia ? togglePlayback : undefined}
              disabled={!hasMedia}
              title={!hasMedia ? 'No Media Loaded' : isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              className={`w-10 h-10 flex items-center justify-center bg-[#2c2c2c] hover:bg-[#3a3a3a] text-white border border-[#484848] rounded-md transition-colors shadow ${
                !hasMedia ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {isPlaying ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 3h3v10H4V3z M9 3h3v10H9V3z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="ml-0.5">
                  <path d="M4 3l9 5-9 5V3z" />
                </svg>
              )}
            </button>

            {/* Step Forward 5s */}
            <button
              type="button"
              onClick={hasMedia ? () => handleStep(5.0) : undefined}
              disabled={!hasMedia}
              title="Step Forward 5s (Right Arrow / L)"
              className={`w-9 h-9 flex items-center justify-center text-[#aaaaaa] hover:text-white hover:bg-[#282828] rounded transition-colors ${
                !hasMedia ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10 3h2v10h-2V3z M3 4.5L8.5 8 3 11.5V4.5z" />
              </svg>
            </button>
          </div>

          {/* Audio Button with Vertical Popup Slider - Docked in Right Corner */}
          <div ref={volumeContainerRef} className="absolute right-2 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={() => setShowVolumeSlider((prev) => !prev)}
              onContextMenu={(e) => {
                e.preventDefault();
                setIsMuted((prev) => !prev);
              }}
              title={isMuted ? 'Unmute' : `Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors cursor-pointer ${
                showVolumeSlider
                  ? 'bg-[#333333] text-white border border-[#555555]'
                  : 'text-[#aaaaaa] hover:text-white hover:bg-[#282828]'
              }`}
            >
              {isMuted || volume === 0 ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>

            {/* Vertical Volume Slider Popup */}
            {showVolumeSlider && (
              <div className="absolute bottom-full right-0 mb-1.5 w-7 h-24 bg-[#1e1e1e] border border-[#383838] rounded flex flex-col items-center justify-center py-2 z-50 select-none shadow-xl">
                <div
                  onPointerDown={handleVolumePointerDown}
                  onPointerMove={handleVolumePointerMove}
                  onPointerUp={(e) => {
                    try {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    } catch (_) {}
                  }}
                  className="w-full h-full flex items-center justify-center cursor-pointer relative"
                  title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                >
                  <div className="w-1.5 h-full bg-[#121212] rounded-full relative overflow-hidden pointer-events-none">
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-white/70"
                      style={{ height: `${(isMuted ? 0 : volume) * 100}%` }}
                    />
                  </div>

                  <div
                    className="absolute w-3.5 h-2 bg-white rounded-xs shadow pointer-events-none -translate-x-1/2 left-1/2"
                    style={{
                      bottom: `calc(${Math.max(0, Math.min(100, (isMuted ? 0 : volume) * 100))}% - 4px)`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgramMonitor;
