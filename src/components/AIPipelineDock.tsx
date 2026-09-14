import React, { useState, useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { safeConvertFileSrc } from '../utils/mediaUtils';
import { MediaAsset, SentenceSegment } from '../types';

interface AIPipelineDockProps {
  assets: MediaAsset[];
  activeVoicePath: string;
  activeScriptPath: string;
  activeFootagePath?: string;
  onSelectFootage?: (path: string) => void;
  segments: SentenceSegment[];
  outputDir: string;
  onSelectVoice: (path: string) => void;
  onSelectScript: (path: string) => void;
  onSegmentsMatched: (segments: SentenceSegment[]) => void;
  onLoadToPreview?: (asset: MediaAsset) => void;
  onClearPreview?: () => void;
  onAddAssets?: (assets: MediaAsset[]) => void;
  hoverDropZone?: string | null;
}

function parseDroppedAsset(e: React.DragEvent): MediaAsset | null {
  try {
    const jsonStr = e.dataTransfer.getData('application/json');
    if (jsonStr) {
      return JSON.parse(jsonStr);
    }
  } catch (err) {
    console.warn('Failed to parse dropped asset JSON:', err);
  }
  return null;
}

export function isVoiceAsset(asset: MediaAsset): boolean {
  if (asset.fileType === 'voice') return true;
  if (asset.fileType === 'script') return false;
  const lower = asset.name.toLowerCase();
  if (lower.includes('voice') || lower.includes('audio')) return true;
  const ext = lower.split('.').pop() || '';
  return ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext);
}

export function isScriptAsset(asset: MediaAsset): boolean {
  if (asset.fileType === 'script') return true;
  if (asset.fileType === 'voice') return false;
  const ext = asset.name.split('.').pop()?.toLowerCase() || '';
  return ['txt', 'srt', 'md'].includes(ext);
}

export function isVideoAsset(asset: MediaAsset): boolean {
  if (asset.fileType === 'voice' || asset.fileType === 'script') return false;
  const lower = asset.name.toLowerCase();
  if (lower.includes('voice') || lower.includes('audio')) return false;
  if (asset.fileType === 'video') return true;
  const ext = lower.split('.').pop() || '';
  return ['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext);
}

export const AIPipelineDock: React.FC<AIPipelineDockProps> = ({
  assets,
  activeVoicePath,
  activeScriptPath,
  activeFootagePath: propActiveFootagePath,
  onSelectFootage,
  segments: _segments,
  outputDir,
  onSelectVoice,
  onSelectScript,
  onSegmentsMatched,
  onLoadToPreview,
  onClearPreview,
  onAddAssets,
  hoverDropZone,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [_statusText, setStatusText] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<'voice' | 'script' | 'footage' | 'dock' | null>(null);
  const [holdingSlot, setHoldingSlot] = useState<'voice' | 'script' | 'footage' | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active footage path for slot 3 (controlled via prop if provided, else internal)
  const [internalFootagePath, setInternalFootagePath] = useState<string>('');
  const activeFootagePath = propActiveFootagePath !== undefined ? propActiveFootagePath : internalFootagePath;

  const handleSelectFootage = (path: string) => {
    setInternalFootagePath(path);
    onSelectFootage?.(path);
    const matched = assets.find((a) => a.path === path);
    if (matched) {
      onLoadToPreview?.(matched);
    } else {
      onClearPreview?.();
    }
  };

  // Dropdown states for "Choose File"
  const [openDropdown, setOpenDropdown] = useState<'voice' | 'script' | 'footage' | null>(null);

  // Script text snippet for slot 2
  const [scriptSnippet, setScriptSnippet] = useState<string>('');

  const startHoldTimer = (slot: 'voice' | 'script' | 'footage') => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      setHoldingSlot(slot);
    }, 180);
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldingSlot(null);
  };

  // Reset hold timer on window mouseup
  useEffect(() => {
    const handleRelease = () => clearHoldTimer();
    window.addEventListener('mouseup', handleRelease);
    window.addEventListener('pointerup', handleRelease);
    window.addEventListener('blur', handleRelease);
    return () => {
      window.removeEventListener('mouseup', handleRelease);
      window.removeEventListener('pointerup', handleRelease);
      window.removeEventListener('blur', handleRelease);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown-container]')) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch script snippet when activeScriptPath changes
  useEffect(() => {
    if (activeScriptPath) {
      invoke<string>('read_text_snippet', { path: activeScriptPath })
        .then((snippet) => {
          setScriptSnippet(snippet.trim());
        })
        .catch((err) => {
          console.warn('Could not read script snippet:', err);
          setScriptSnippet('');
        });
    } else {
      setScriptSnippet('');
    }
  }, [activeScriptPath]);

  const voiceAssets = useMemo(() => assets.filter(isVoiceAsset), [assets]);
  const scriptAssets = useMemo(() => assets.filter(isScriptAsset), [assets]);
  const videoAssets = useMemo(() => assets.filter(isVideoAsset), [assets]);

  const normalizePath = (p?: string | null) => (p || '').trim().replace(/\\/g, '/').toLowerCase();

  const activeVoiceAsset = useMemo(
    () => assets.find((a) => normalizePath(a.path) === normalizePath(activeVoicePath)),
    [assets, activeVoicePath]
  );
  const activeScriptAsset = useMemo(
    () => assets.find((a) => normalizePath(a.path) === normalizePath(activeScriptPath)),
    [assets, activeScriptPath]
  );
  const activeFootageAsset = useMemo(() => {
    if (!activeFootagePath) return null;
    const found = assets.find((a) => normalizePath(a.path) === normalizePath(activeFootagePath));
    if (found) return found;
    const cleanPath = activeFootagePath.replace(/\\/g, '/');
    const name = cleanPath.split('/').pop() || 'Footage';
    return {
      id: `footage_${cleanPath}`,
      name,
      path: activeFootagePath,
      fileType: 'video' as const,
      sizeBytes: 0,
    };
  }, [assets, activeFootagePath]);

  // Auto clean active paths if removed from assets
  useEffect(() => {
    if (activeVoicePath && assets.length > 0 && !assets.some((a) => normalizePath(a.path) === normalizePath(activeVoicePath))) {
      onSelectVoice('');
    }
  }, [assets, activeVoicePath, onSelectVoice]);

  useEffect(() => {
    if (activeScriptPath && assets.length > 0 && !assets.some((a) => normalizePath(a.path) === normalizePath(activeScriptPath))) {
      onSelectScript('');
    }
  }, [assets, activeScriptPath, onSelectScript]);

  useEffect(() => {
    if (activeFootagePath && assets.length > 0 && !assets.some((a) => normalizePath(a.path) === normalizePath(activeFootagePath))) {
      handleSelectFootage('');
    }
  }, [assets, activeFootagePath]);

  const canRun = Boolean(activeVoicePath && activeScriptPath);

  // File pickers
  const handlePickVoice = async () => {
    try {
      const picked = await invoke<MediaAsset[]>('pick_files_multi');
      if (picked && picked.length > 0) {
        onAddAssets?.(picked);
        const voice = picked.find(isVoiceAsset);
        if (voice) {
          onSelectVoice(voice.path);
        }
      }
    } catch (err) {
      console.error('Pick voice error:', err);
    }
  };

  const handlePickScript = async () => {
    try {
      const picked = await invoke<MediaAsset[]>('pick_files_multi');
      if (picked && picked.length > 0) {
        onAddAssets?.(picked);
        const script = picked.find(isScriptAsset);
        if (script) {
          onSelectScript(script.path);
        }
      }
    } catch (err) {
      console.error('Pick script error:', err);
    }
  };

  const handlePickFootage = async () => {
    try {
      const picked = await invoke<MediaAsset[]>('pick_files_multi');
      if (picked && picked.length > 0) {
        onAddAssets?.(picked);
        const video = picked.find(isVideoAsset);
        if (video) {
          handleSelectFootage(video.path);
        }
      }
    } catch (err) {
      console.error('Pick footage error:', err);
    }
  };

  const handleRunAIAnalysis = async () => {
    if (!canRun || isAnalyzing) return;

    setIsAnalyzing(true);
    setStatusText('Analyzing speech & aligning footage...');

    try {
      const brollPaths = videoAssets.map((a) => a.path);
      const outDir = outputDir || './output';

      const result = await invoke<SentenceSegment[]>('execute_voice_visual_matching', {
        voicePath: activeVoicePath,
        scriptPath: activeScriptPath,
        brollPaths,
        outputDir: outDir,
      });

      onSegmentsMatched(result);
      setStatusText(`${result.length} scenes synchronized`);
    } catch (err: any) {
      console.error('AI Pipeline execution error:', err);
      setStatusText(err?.toString() || 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragTarget(null);
        const asset = parseDroppedAsset(e);
        if (asset) {
          if (isVoiceAsset(asset)) {
            onSelectVoice(asset.path);
            setStatusText(`Voiceover mounted: ${asset.name}`);
          } else if (isScriptAsset(asset)) {
            onSelectScript(asset.path);
            setStatusText(`Script mounted: ${asset.name}`);
          } else if (isVideoAsset(asset)) {
            handleSelectFootage(asset.path);
            setStatusText(`Footage preview: ${asset.name}`);
          }
        }
      }}
      data-drop-zone="dock"
      className="bg-[#1c1c1c] border-b border-[#2d2d2d] px-3 py-2 flex flex-col gap-1.5 shrink-0 select-none"
    >
      {/* 4 Columns: 3 Input Slots + 1 Pipeline Execution */}
      <div className="grid grid-cols-4 gap-2.5">
        {/* ======================================================== */}
        {/* SLOT 1: VOICEOVER */}
        {/* ======================================================== */}
        <div className="flex flex-col min-w-0" data-dropdown-container>
          {/* Label Outside Above */}
          <div className="flex items-center justify-between text-[10px] font-mono text-[#888888] font-bold mb-1 px-0.5">
            <span>1. VOICEOVER</span>
            {activeVoiceAsset && (
              <button
                type="button"
                onClick={() => {
                  onSelectVoice('');
                  setStatusText('Voiceover unmounted');
                }}
                className="text-[8.5px] font-mono text-[#888888] hover:text-white transition-colors cursor-pointer"
                title="Unmount voiceover"
              >
                CLEAR
              </button>
            )}
          </div>

          {/* Slot Box */}
          {activeVoiceAsset ? (
            <div
              data-drop-zone="voice"
              draggable
              onMouseDown={(e) => {
                if (e.button === 0) startHoldTimer('voice');
              }}
              onMouseUp={clearHoldTimer}
              onDragStart={(e) => {
                clearHoldTimer();
                e.dataTransfer.setData('unmount-slot', 'voice');
                e.dataTransfer.setData('text/plain', activeVoiceAsset.path);
                e.dataTransfer.setData('application/json', JSON.stringify(activeVoiceAsset));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={(e) => {
                clearHoldTimer();
                const dock = document.querySelector('[data-drop-zone="dock"]');
                if (dock) {
                  const rect = dock.getBoundingClientRect();
                  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                    onSelectVoice('');
                    setStatusText('Voiceover unmounted');
                  }
                }
              }}
              className={`h-[76px] bg-[#141414] border border-[#2e2e2e] hover:border-[#444444] rounded p-2 flex items-center justify-center select-none transition-colors ${
                holdingSlot === 'voice' ? 'cursor-grabbing' : 'cursor-default'
              }`}
              title={`${activeVoiceAsset.name} (Drag out to workspace to unmount)`}
            >
              {/* Full-height Waveform Display */}
              <div className="flex items-center justify-center gap-[3px] w-full h-full px-2 bg-[#0d0d0d] rounded border border-[#222222]">
                {[25, 50, 75, 35, 90, 100, 60, 80, 45, 95, 70, 40, 85, 55, 30, 85, 60, 35, 75, 45].map((h, i) => (
                  <div
                    key={i}
                    className="w-[2.5px] bg-[#888888] rounded-full"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div
              data-drop-zone="voice"
              onClick={handlePickVoice}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                setDragTarget('voice');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragTarget((prev) => (prev === 'voice' ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragTarget(null);
                const asset = parseDroppedAsset(e);
                if (asset && isVoiceAsset(asset)) {
                  onSelectVoice(asset.path);
                  setStatusText(`Voiceover mounted: ${asset.name}`);
                }
              }}
              className={`h-[76px] border border-dashed rounded flex items-center justify-center transition-colors cursor-pointer group select-none ${
                dragTarget === 'voice' || hoverDropZone === 'voice'
                  ? 'bg-[#1e1e1e] border-[#666666] ring-1 ring-[#888888]'
                  : 'bg-[#131313] border-[#333333] hover:border-[#555555] hover:bg-[#181818]'
              }`}
              title="Click to select or drop audio file"
            >
              <span className="text-[#666666] group-hover:text-white text-2xl font-light leading-none select-none transition-colors">
                +
              </span>
            </div>
          )}

          {/* Choose File Button Below */}
          <div className="relative mt-1.5">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'voice' ? null : 'voice')}
              className="w-full py-1 px-2 bg-[#191919] hover:bg-[#252525] border border-[#303030] rounded text-[10px] font-mono text-[#cccccc] hover:text-white flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="truncate">{activeVoiceAsset ? activeVoiceAsset.name : 'Choose File'}</span>
              <span className="text-[8px] text-[#777777] ml-1 shrink-0">▼</span>
            </button>

            {openDropdown === 'voice' && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1a1a] border border-[#383838] rounded shadow-2xl z-50 py-1 max-h-48 overflow-y-auto font-mono text-[10px]">
                {voiceAssets.length === 0 ? (
                  <div className="px-2 py-1.5 text-[#666666] text-center">No audio files in pool</div>
                ) : (
                  voiceAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => {
                        onSelectVoice(asset.path);
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-2 py-1.5 truncate transition-colors cursor-pointer flex items-center justify-between ${
                        activeVoicePath === asset.path
                          ? 'bg-[#2a2a2a] text-white font-bold'
                          : 'text-[#cccccc] hover:bg-[#252525] hover:text-white'
                      }`}
                    >
                      <span className="truncate">{asset.name}</span>
                    </button>
                  ))
                )}
                <div className="border-t border-[#2d2d2d] my-1" />
                <button
                  type="button"
                  onClick={() => {
                    handlePickVoice();
                    setOpenDropdown(null);
                  }}
                  className="w-full text-left px-2 py-1.5 text-[#cccccc] hover:bg-[#252525] hover:text-white transition-colors cursor-pointer"
                >
                  + Browse from computer...
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* SLOT 2: SCRIPT */}
        {/* ======================================================== */}
        <div className="flex flex-col min-w-0" data-dropdown-container>
          {/* Label Outside Above */}
          <div className="flex items-center justify-between text-[10px] font-mono text-[#888888] font-bold mb-1 px-0.5">
            <span>2. SCRIPT</span>
            {activeScriptAsset && (
              <button
                type="button"
                onClick={() => {
                  onSelectScript('');
                  setStatusText('Script unmounted');
                }}
                className="text-[8.5px] font-mono text-[#888888] hover:text-white transition-colors cursor-pointer"
                title="Unmount script"
              >
                CLEAR
              </button>
            )}
          </div>

          {/* Slot Box */}
          {activeScriptAsset ? (
            <div
              data-drop-zone="script"
              draggable
              onMouseDown={(e) => {
                if (e.button === 0) startHoldTimer('script');
              }}
              onMouseUp={clearHoldTimer}
              onDragStart={(e) => {
                clearHoldTimer();
                e.dataTransfer.setData('unmount-slot', 'script');
                e.dataTransfer.setData('text/plain', activeScriptAsset.path);
                e.dataTransfer.setData('application/json', JSON.stringify(activeScriptAsset));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={(e) => {
                clearHoldTimer();
                const dock = document.querySelector('[data-drop-zone="dock"]');
                if (dock) {
                  const rect = dock.getBoundingClientRect();
                  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                    onSelectScript('');
                    setStatusText('Script unmounted');
                  }
                }
              }}
              className={`h-[76px] bg-[#141414] border border-[#2e2e2e] hover:border-[#444444] rounded p-2 select-none transition-colors ${
                holdingSlot === 'script' ? 'cursor-grabbing' : 'cursor-default'
              }`}
              title={`${activeScriptAsset.name} (Drag out to workspace to unmount)`}
            >
              {/* Text Snapshot Display */}
              <div className="w-full h-full bg-[#0d0d0d] border border-[#222222] rounded p-2 overflow-hidden flex items-center">
                <span className="text-[9px] font-mono text-[#aaaaaa] leading-relaxed line-clamp-3 block break-all select-none">
                  {scriptSnippet || activeScriptAsset.name}
                </span>
              </div>
            </div>
          ) : (
            <div
              data-drop-zone="script"
              onClick={handlePickScript}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                setDragTarget('script');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragTarget((prev) => (prev === 'script' ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragTarget(null);
                const asset = parseDroppedAsset(e);
                if (asset && isScriptAsset(asset)) {
                  onSelectScript(asset.path);
                  setStatusText(`Script mounted: ${asset.name}`);
                }
              }}
              className={`h-[76px] border border-dashed rounded flex items-center justify-center transition-colors cursor-pointer group select-none ${
                dragTarget === 'script' || hoverDropZone === 'script'
                  ? 'bg-[#1e1e1e] border-[#666666] ring-1 ring-[#888888]'
                  : 'bg-[#131313] border-[#333333] hover:border-[#555555] hover:bg-[#181818]'
              }`}
              title="Click to select or drop script file"
            >
              <span className="text-[#666666] group-hover:text-white text-2xl font-light leading-none select-none transition-colors">
                +
              </span>
            </div>
          )}

          {/* Choose File Button Below */}
          <div className="relative mt-1.5">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'script' ? null : 'script')}
              className="w-full py-1 px-2 bg-[#191919] hover:bg-[#252525] border border-[#303030] rounded text-[10px] font-mono text-[#cccccc] hover:text-white flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="truncate">{activeScriptAsset ? activeScriptAsset.name : 'Choose File'}</span>
              <span className="text-[8px] text-[#777777] ml-1 shrink-0">▼</span>
            </button>

            {openDropdown === 'script' && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1a1a] border border-[#383838] rounded shadow-2xl z-50 py-1 max-h-48 overflow-y-auto font-mono text-[10px]">
                {scriptAssets.length === 0 ? (
                  <div className="px-2 py-1.5 text-[#666666] text-center">No script files in pool</div>
                ) : (
                  scriptAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => {
                        onSelectScript(asset.path);
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-2 py-1.5 truncate transition-colors cursor-pointer flex items-center justify-between ${
                        activeScriptPath === asset.path
                          ? 'bg-[#2a2a2a] text-white font-bold'
                          : 'text-[#cccccc] hover:bg-[#252525] hover:text-white'
                      }`}
                    >
                      <span className="truncate">{asset.name}</span>
                    </button>
                  ))
                )}
                <div className="border-t border-[#2d2d2d] my-1" />
                <button
                  type="button"
                  onClick={() => {
                    handlePickScript();
                    setOpenDropdown(null);
                  }}
                  className="w-full text-left px-2 py-1.5 text-[#cccccc] hover:bg-[#252525] hover:text-white transition-colors cursor-pointer"
                >
                  + Browse from computer...
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* SLOT 3: FOOTAGE */}
        {/* ======================================================== */}
        <div className="flex flex-col min-w-0" data-dropdown-container>
          {/* Label Outside Above */}
          <div className="flex items-center justify-between text-[10px] font-mono text-[#888888] font-bold mb-1 px-0.5">
            <span>3. FOOTAGE</span>
            {activeFootageAsset && (
              <button
                type="button"
                onClick={() => {
                  handleSelectFootage('');
                  setStatusText('Footage preview cleared');
                }}
                className="text-[8.5px] font-mono text-[#888888] hover:text-white transition-colors cursor-pointer"
                title="Clear footage"
              >
                CLEAR
              </button>
            )}
          </div>

          {/* Slot Box */}
          {activeFootageAsset ? (
            <div
              data-drop-zone="footage"
              draggable
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                setDragTarget('footage');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragTarget((prev) => (prev === 'footage' ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragTarget(null);
                const asset = parseDroppedAsset(e);
                if (asset && (isVideoAsset(asset) || asset.fileType === 'image')) {
                  handleSelectFootage(asset.path);
                  setStatusText(`Footage preview: ${asset.name}`);
                }
              }}
              onMouseDown={(e) => {
                if (e.button === 0) startHoldTimer('footage');
              }}
              onMouseUp={clearHoldTimer}
              onDragStart={(e) => {
                clearHoldTimer();
                e.dataTransfer.setData('unmount-slot', 'footage');
                e.dataTransfer.setData('text/plain', activeFootageAsset.path);
                e.dataTransfer.setData('application/json', JSON.stringify(activeFootageAsset));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={(e) => {
                clearHoldTimer();
                const dock = document.querySelector('[data-drop-zone="dock"]');
                if (dock) {
                  const rect = dock.getBoundingClientRect();
                  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                    handleSelectFootage('');
                    onClearPreview?.();
                    setStatusText('Footage preview unmounted');
                  }
                }
              }}
              onClick={() => {
                if (onLoadToPreview) onLoadToPreview(activeFootageAsset);
              }}
              className={`h-[76px] bg-[#141414] border border-[#2e2e2e] hover:border-[#444444] rounded overflow-hidden select-none transition-colors relative group ${
                holdingSlot === 'footage' ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              title={`${activeFootageAsset.name} (Drag out to unmount, or click to preview)`}
            >
              {/* Thumbnail Display */}
              {activeFootageAsset.fileType === 'image' ? (
                <img
                  src={safeConvertFileSrc(activeFootageAsset.path)}
                  alt={activeFootageAsset.name}
                  className="w-full h-full object-cover pointer-events-none"
                />
              ) : (
                <video
                  src={safeConvertFileSrc(activeFootageAsset.path)}
                  preload="auto"
                  muted
                  playsInline
                  onLoadedMetadata={(e) => {
                    try {
                      e.currentTarget.currentTime = 0.1;
                    } catch (_) {}
                  }}
                  className="w-full h-full object-cover pointer-events-none"
                />
              )}
            </div>
          ) : (
            <div
              data-drop-zone="footage"
              onClick={handlePickFootage}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                setDragTarget('footage');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragTarget((prev) => (prev === 'footage' ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragTarget(null);
                const asset = parseDroppedAsset(e);
                if (asset && (isVideoAsset(asset) || asset.fileType === 'image')) {
                  handleSelectFootage(asset.path);
                  setStatusText(`Footage preview: ${asset.name}`);
                  return;
                }
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const file = e.dataTransfer.files[0];
                  const fullPath = (file as any).path || (file as any).webkitRelativePath;
                  if (fullPath) {
                    const newAsset: MediaAsset = {
                      id: `footage_${Date.now()}`,
                      name: file.name,
                      path: fullPath,
                      fileType: 'video',
                      sizeBytes: file.size,
                    };
                    onAddAssets?.([newAsset]);
                    handleSelectFootage(fullPath);
                    setStatusText(`Footage: ${file.name}`);
                  }
                }
              }}
              className={`h-[76px] border border-dashed rounded flex items-center justify-center transition-colors cursor-pointer group select-none ${
                dragTarget === 'footage' || hoverDropZone === 'footage'
                  ? 'bg-[#1e1e1e] border-[#666666] ring-1 ring-[#888888]'
                  : 'bg-[#131313] border-[#333333] hover:border-[#555555] hover:bg-[#181818]'
              }`}
              title="Click to select or drop video clip"
            >
              <span className="text-[#666666] group-hover:text-white text-2xl font-light leading-none select-none transition-colors">
                +
              </span>
            </div>
          )}

          {/* Choose File Button Below */}
          <div className="relative mt-1.5">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'footage' ? null : 'footage')}
              className="w-full py-1 px-2 bg-[#191919] hover:bg-[#252525] border border-[#303030] rounded text-[10px] font-mono text-[#cccccc] hover:text-white flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="truncate">{activeFootageAsset ? activeFootageAsset.name : 'Choose File'}</span>
              <span className="text-[8px] text-[#777777] ml-1 shrink-0">▼</span>
            </button>

            {openDropdown === 'footage' && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1a1a] border border-[#383838] rounded shadow-2xl z-50 py-1 max-h-48 overflow-y-auto font-mono text-[10px]">
                {videoAssets.length === 0 ? (
                  <div className="px-2 py-1.5 text-[#666666] text-center">No video clips in pool</div>
                ) : (
                  videoAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => {
                        handleSelectFootage(asset.path);
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-2 py-1.5 truncate transition-colors cursor-pointer flex items-center justify-between ${
                        activeFootagePath === asset.path
                          ? 'bg-[#2a2a2a] text-white font-bold'
                          : 'text-[#cccccc] hover:bg-[#252525] hover:text-white'
                      }`}
                    >
                      <span className="truncate">{asset.name}</span>
                    </button>
                  ))
                )}
                <div className="border-t border-[#2d2d2d] my-1" />
                <button
                  type="button"
                  onClick={() => {
                    handlePickFootage();
                    setOpenDropdown(null);
                  }}
                  className="w-full text-left px-2 py-1.5 text-[#cccccc] hover:bg-[#252525] hover:text-white transition-colors cursor-pointer"
                >
                  + Browse from computer...
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* SLOT 4: PIPELINE ACTION */}
        {/* ======================================================== */}
        <div className="flex flex-col min-w-0">
          {/* Spacer to align with slots 1, 2, 3 */}
          <div className="h-[15px] mb-1" />

          {/* Action Trigger Button (Height 76px matching slots) */}
          <button
            type="button"
            disabled={!canRun || isAnalyzing}
            onClick={handleRunAIAnalysis}
            className="h-[76px] bg-[#242424] hover:bg-[#303030] active:bg-[#3a3a3a] disabled:bg-[#141414] disabled:text-[#444444] text-white font-mono font-bold text-xs rounded border border-[#383838] disabled:border-[#222222] transition-colors cursor-pointer flex items-center justify-center text-center p-3 select-none"
            title={canRun ? 'Analyze speech and align video clips to sentences' : 'Mount Voiceover and Script first'}
          >
            <span className="tracking-wider">
              {isAnalyzing ? 'ANALYZING...' : 'START ANALYSIS'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIPipelineDock;
