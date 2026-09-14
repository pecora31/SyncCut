import React, { useState, useMemo, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { safeConvertFileSrc } from '../../utils/mediaUtils';
import { MediaAsset, SentenceSegment } from '../../types';
import { isVoiceAsset, isScriptAsset, isVideoAsset } from '../AIPipelineDock';

interface MediaPoolTabProps {
  assets: MediaAsset[];
  segments?: SentenceSegment[];
  activeVoicePath: string;
  activeScriptPath: string;
  previewAsset?: MediaAsset | null;
  onClearPreview?: () => void;
  onSelectVoice: (path: string) => void;
  onSelectScript: (path: string) => void;
  onSelectFootage?: (path: string) => void;
  onPreviewAsset: (asset: MediaAsset) => void;
  onAddAssets: (assets: MediaAsset[]) => void;
  onRemoveAsset: (id: string) => void;
  onRemoveAssets?: (ids: string[]) => void;
  onOpenYouTubePopup?: () => void;
  onDragAssetStart?: (asset: MediaAsset) => void;
  onDragAssetEnd?: () => void;
  setHoverDropZone?: (zone: string | null) => void;
}

function formatSeconds(sec?: number): string {
  if (!sec || sec <= 0) return '0:00';
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function getAssetCategory(asset: MediaAsset): 'image' | 'video' | 'voice' | 'script' {
  if (asset.fileType === 'image') return 'image';
  if (isScriptAsset(asset)) return 'script';
  if (isVoiceAsset(asset)) return 'voice';
  if (isVideoAsset(asset)) return 'video';
  const ext = asset.name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  return 'video';
}

export const MediaPoolTab: React.FC<MediaPoolTabProps> = ({
  assets,
  segments: _segments = [],
  activeVoicePath,
  activeScriptPath,
  previewAsset,
  onClearPreview,
  onSelectVoice,
  onSelectScript,
  onSelectFootage,
  onPreviewAsset,
  onAddAssets,
  onRemoveAsset,
  onRemoveAssets,
  onOpenYouTubePopup,
  onDragAssetStart,
  onDragAssetEnd,
  setHoverDropZone,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isHoveringDrop, setIsHoveringDrop] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [holdingAssetId, setHoldingAssetId] = useState<string | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; asset: MediaAsset } | null>(null);

  // Unified Pointer Drag State (Consistent grabbing hand + ghost card on all drags)
  const [pointerDragAsset, setPointerDragAsset] = useState<MediaAsset | null>(null);
  const [pointerDragCoords, setPointerDragCoords] = useState<{ x: number; y: number } | null>(null);
  const isPointerDraggingRef = useRef(false);
  const pointerCandidateRef = useRef<{ asset: MediaAsset; startX: number; startY: number } | null>(null);

  // Script text snippets cache for realistic snapshot display
  const [scriptSnippets, setScriptSnippets] = useState<Record<string, string>>({});

  useEffect(() => {
    assets.forEach((asset) => {
      if (getAssetCategory(asset) === 'script' && !scriptSnippets[asset.path]) {
        invoke<string>('read_text_snippet', { path: asset.path })
          .then((snippet) => {
            setScriptSnippets((prev) => ({ ...prev, [asset.path]: snippet.trim() }));
          })
          .catch(() => {});
      }
    });
  }, [assets, scriptSnippets]);

  const startHoldTimer = (id: string) => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      setHoldingAssetId(id);
    }, 180);
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldingAssetId(null);
  };

  // Reset hold timer on window-level mouse/pointer release or blur
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

  // Global grabbing cursor enforcement: guarantees the cursor is ALWAYS 'grabbing' while dragging
  useEffect(() => {
    if (pointerDragAsset) {
      const styleEl = document.createElement('style');
      styleEl.id = 'unified-drag-cursor-override';
      styleEl.innerHTML = '* { cursor: grabbing !important; }';
      document.head.appendChild(styleEl);
      return () => {
        styleEl.remove();
      };
    }
  }, [pointerDragAsset]);

  // Unified global pointer drag tracking: activates smoothly on all drag gestures
  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      if (e.buttons === 1 && pointerCandidateRef.current) {
        const { asset, startX, startY } = pointerCandidateRef.current;
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist > 4) {
          clearHoldTimer();
          setPointerDragAsset(asset);
          setPointerDragCoords({ x: e.clientX, y: e.clientY });
          setDraggedAssetId(asset.id);

          if (!isPointerDraggingRef.current) {
            isPointerDraggingRef.current = true;
            onDragAssetStart?.(asset);
          }

          const el = document.elementFromPoint(e.clientX, e.clientY);
          const zone = el?.closest('[data-drop-zone]')?.getAttribute('data-drop-zone') || null;
          setHoverDropZone?.(zone);
        }
      }
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      clearHoldTimer();
      if (pointerCandidateRef.current && pointerDragAsset) {
        const candidateAsset = pointerCandidateRef.current.asset;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const zone = el?.closest('[data-drop-zone]')?.getAttribute('data-drop-zone');
        const ext = candidateAsset.name.split('.').pop()?.toLowerCase() || '';
        const isVoice = candidateAsset.fileType === 'voice' || ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(ext);
        const isScript = candidateAsset.fileType === 'script' || ['txt', 'srt', 'md'].includes(ext);
        const isVideo = candidateAsset.fileType === 'video' || ['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext);

        if (zone === 'preview') {
          if (isVoice) {
            onSelectVoice(candidateAsset.path);
          } else if (isScript) {
            onSelectScript(candidateAsset.path);
          } else {
            onSelectFootage?.(candidateAsset.path);
            onPreviewAsset(candidateAsset);
          }
        } else if (zone === 'voice') {
          if (isVoice) {
            onSelectVoice(candidateAsset.path);
          }
        } else if (zone === 'script') {
          if (isScript) {
            onSelectScript(candidateAsset.path);
          }
        } else if (zone === 'footage') {
          if (isVideo || candidateAsset.fileType === 'image') {
            onSelectFootage?.(candidateAsset.path);
            onPreviewAsset(candidateAsset);
          }
        } else if (zone === 'dock') {
          if (isVoice) {
            onSelectVoice(candidateAsset.path);
          } else if (isScript) {
            onSelectScript(candidateAsset.path);
          } else if (isVideo || candidateAsset.fileType === 'image') {
            onSelectFootage?.(candidateAsset.path);
            onPreviewAsset(candidateAsset);
          }
        }
      }

      if (isPointerDraggingRef.current) {
        isPointerDraggingRef.current = false;
        onDragAssetEnd?.();
      }

      pointerCandidateRef.current = null;
      setPointerDragAsset(null);
      setPointerDragCoords(null);
      setDraggedAssetId(null);
      setHoverDropZone?.(null);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [pointerDragAsset, onPreviewAsset, onSelectVoice, onSelectScript, setHoverDropZone, onDragAssetStart, onDragAssetEnd]);

  // Global drop / dragend listener to reset any lingering state
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      clearHoldTimer();
      if (isPointerDraggingRef.current) {
        isPointerDraggingRef.current = false;
        onDragAssetEnd?.();
      }
      pointerCandidateRef.current = null;
      setPointerDragAsset(null);
      setPointerDragCoords(null);
      setDraggedAssetId(null);
      setHoverDropZone?.(null);
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    window.addEventListener('drop', handleGlobalDragEnd);
    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd);
      window.removeEventListener('drop', handleGlobalDragEnd);
    };
  }, [setHoverDropZone, onDragAssetEnd]);

  // Close context menu on outside click or right-click
  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
    };
  }, []);

  // Delete key shortcut for selected items
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.key === 'Delete' && selectedIds.size > 0) {
        e.preventDefault();
        const ids = Array.from(selectedIds);
        if (onRemoveAssets) {
          onRemoveAssets(ids);
        } else {
          ids.forEach((id) => onRemoveAsset(id));
        }
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, onRemoveAsset, onRemoveAssets]);

  const handleOpenMediaFolder = async () => {
    try {
      await invoke('open_directory', { path: 'media_pool' });
    } catch (err) {
      console.warn('Could not open media_pool directory:', err);
    }
  };

  const handleBrowseFiles = async () => {
    try {
      const picked = await invoke<MediaAsset[]>('pick_files_multi');
      if (picked && picked.length > 0) {
        onAddAssets(picked);

        const firstVoice = picked.find((a) => a.fileType === 'voice');
        if (firstVoice && !activeVoicePath) {
          onSelectVoice(firstVoice.path);
        }
        const firstScript = picked.find((a) => a.fileType === 'script');
        if (firstScript && !activeScriptPath) {
          onSelectScript(firstScript.path);
        }
      }
    } catch (err) {
      console.error('Pick files error:', err);
    }
  };

  // Filter assets by search query
  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return assets;
    const q = searchQuery.toLowerCase();
    return assets.filter(
      (a) => a.name.toLowerCase().includes(q) || a.fileType.toLowerCase().includes(q)
    );
  }, [assets, searchQuery]);

  const handleItemClick = (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation();
    setContextMenu(null);
    if (e.ctrlKey || e.metaKey) {
      // Toggle selection with Ctrl / Cmd
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(asset.id)) {
          next.delete(asset.id);
        } else {
          next.add(asset.id);
        }
        return next;
      });
    } else {
      setSelectedIds(new Set([asset.id]));
    }
  };

  const isAssetActive = (asset: MediaAsset) => {
    if (isVoiceAsset(asset)) return activeVoicePath === asset.path;
    if (isScriptAsset(asset)) return activeScriptPath === asset.path;
    return previewAsset?.path === asset.path;
  };

  const handleTogglePreview = (asset: MediaAsset) => {
    if (isAssetActive(asset)) {
      if (isVoiceAsset(asset)) {
        onSelectVoice('');
      } else if (isScriptAsset(asset)) {
        onSelectScript('');
      } else {
        onClearPreview?.();
      }
    } else {
      if (isVoiceAsset(asset)) {
        onSelectVoice(asset.path);
      } else if (isScriptAsset(asset)) {
        onSelectScript(asset.path);
      } else {
        onPreviewAsset(asset);
      }
    }
  };

  const handleItemDoubleClick = (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation();
    clearHoldTimer();
    if (isVoiceAsset(asset)) {
      onSelectVoice(asset.path);
    } else if (isScriptAsset(asset)) {
      onSelectScript(asset.path);
    } else {
      onPreviewAsset(asset);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, asset: MediaAsset) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedIds.has(asset.id)) {
      setSelectedIds(new Set([asset.id]));
    }
    setContextMenu({ x: e.clientX, y: e.clientY, asset });
  };


  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAssets.map((a) => a.id)));
    }
  };

  const handleBackgroundClick = (_e: React.MouseEvent) => {
    // Deselect if clicking on empty workspace background
    setSelectedIds(new Set());
    setContextMenu(null);
  };

  const handleDeleteSelected = () => {
    const ids = Array.from(selectedIds);
    if (onRemoveAssets) {
      onRemoveAssets(ids);
    } else {
      ids.forEach((id) => onRemoveAsset(id));
    }
    setSelectedIds(new Set());
  };

  // Render Realistic Thumbnail Component
  const renderThumbnailContent = (asset: MediaAsset, compact: boolean = false) => {
    const category = getAssetCategory(asset);
    const mediaUrl = `${safeConvertFileSrc(asset.path)}?v=${asset.sizeBytes || 1}`;

    if (category === 'image') {
      return (
        <img
          src={mediaUrl}
          alt={asset.name}
          className="w-full h-full object-cover pointer-events-none"
          loading="lazy"
        />
      );
    }

    if (category === 'video') {
      return (
        <video
          src={`${mediaUrl}#t=0.1`}
          preload="metadata"
          className="w-full h-full object-cover pointer-events-none"
        />
      );
    }

    if (category === 'voice') {
      return (
        <div className="w-full h-full flex items-center justify-center px-2 py-1 bg-[#0d0d0d]">
          <div className="flex items-center justify-center gap-[2.5px] w-full h-7 px-1">
            {[25, 50, 75, 35, 90, 100, 60, 80, 45, 95, 70, 40, 85, 55, 30].map((h, i) => (
              <div
                key={i}
                className="w-[2px] bg-[#888888] rounded-full"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      );
    }

    // Realistic Text / Script Snapshot Display matching Box 2
    const snippet = scriptSnippets[asset.path] || '...';
    if (compact) {
      return (
        <div className="w-full h-full bg-[#0d0d0d] p-1 overflow-hidden flex items-center justify-center">
          <span className="text-[6px] font-mono text-[#888888] leading-tight line-clamp-2">
            TXT
          </span>
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-[#0d0d0d] p-1.5 overflow-hidden flex items-center justify-center">
        <span className="text-[7.5px] font-mono text-[#aaaaaa] leading-snug line-clamp-3 block break-all select-none">
          {snippet}
        </span>
      </div>
    );
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => setIsHoveringDrop(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsHoveringDrop(false);
        const unmountSlot = e.dataTransfer.getData('unmount-slot');
        if (unmountSlot === 'voice') {
          onSelectVoice('');
          return;
        } else if (unmountSlot === 'script') {
          onSelectScript('');
          return;
        } else if (unmountSlot === 'footage' || unmountSlot === 'video') {
          onClearPreview?.();
          return;
        }

        // Native Windows Explorer file drop
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const newAssets: MediaAsset[] = [];
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

            newAssets.push({
              id: `dropped_${Date.now()}_${i}`,
              name: file.name,
              path: fullPath,
              fileType,
              sizeBytes: file.size,
            });
          }

          if (newAssets.length > 0) {
            onAddAssets(newAssets);
            const firstVideo = newAssets.find((a) => a.fileType === 'video' || a.fileType === 'image');
            if (firstVideo) {
              onPreviewAsset(firstVideo);
            }
          }
        }
      }}
      onClick={handleBackgroundClick}
      className="flex flex-col h-full overflow-hidden select-none text-xs bg-[#191919]"
    >
      {/* 1. Premiere Pro Project Bin Header - Enlarged & Comfortable */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="p-2.5 border-b border-[#2a2a2a] flex flex-col gap-2 shrink-0 bg-[#1e1e1e]"
      >
        {/* Row 1: Folder Breadcrumb, Counts & View Mode Switcher */}
        <div className="flex items-center justify-between text-xs text-[#888888] font-mono">
          <div className="flex items-center gap-2 truncate">
            <span className="text-white font-medium">media_pool</span>
            <span className="text-[#666666]">({filteredAssets.length})</span>
            {selectedIds.size > 0 && (
              <span className="px-1.5 py-0.2 bg-[#2a3848] text-[#80b0ff] rounded text-[11px] font-bold">
                {selectedIds.size} selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Multi-Select All Button */}
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="px-2.5 py-1 text-xs text-[#aaaaaa] hover:text-white bg-[#141414] hover:bg-[#282828] border border-[#333333] rounded transition-colors cursor-pointer"
              title="Select or deselect all items"
            >
              {selectedIds.size === filteredAssets.length && filteredAssets.length > 0
                ? 'Deselect'
                : 'Select All'}
            </button>

            {/* View Mode Toggle (Grid / List) */}
            <div className="flex items-center bg-[#141414] border border-[#333333] rounded p-0.5 select-none">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1 rounded-xs text-xs font-mono transition-colors cursor-pointer focus:outline-none ${
                  viewMode === 'grid' ? 'bg-[#333333] text-white' : 'text-[#888888] hover:text-white'
                }`}
                title="Compact Grid View"
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 rounded-xs text-xs font-mono transition-colors cursor-pointer focus:outline-none ${
                  viewMode === 'list' ? 'bg-[#333333] text-white' : 'text-[#888888] hover:text-white'
                }`}
                title="Compact List View"
              >
                List
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Search Bar & Primary Actions */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-[#141414] border border-[#363636] rounded px-2.5 py-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search media..."
              className="w-full bg-transparent text-white placeholder-[#666666] text-xs outline-none font-mono"
            />
          </div>

          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="px-3 py-1.5 bg-[#3a1e1e] hover:bg-[#4a2424] text-[#ff8888] border border-[#663333] rounded text-xs font-medium transition-colors shrink-0 cursor-pointer"
              title="Delete selected files (Del)"
            >
              Delete ({selectedIds.size})
            </button>
          )}

          {onOpenYouTubePopup && (
            <button
              type="button"
              onClick={onOpenYouTubePopup}
              className="px-3 py-1.5 bg-[#252525] hover:bg-[#323232] text-[#d5d5d5] hover:text-white border border-[#3d3d3d] rounded text-xs font-medium transition-colors shrink-0 cursor-pointer"
              title="Download video from YouTube"
            >
              YouTube
            </button>
          )}

          <button
            type="button"
            onClick={handleBrowseFiles}
            className="px-3.5 py-1.5 bg-[#303030] hover:bg-[#3e3e3e] text-white border border-[#4a4a4a] rounded text-xs font-semibold transition-colors shrink-0 cursor-pointer shadow-xs"
            title="Import footage files"
          >
            Import
          </button>

          <button
            type="button"
            onClick={handleOpenMediaFolder}
            className="px-2.5 py-1.5 bg-[#202020] hover:bg-[#2c2c2c] text-[#cccccc] hover:text-white border border-[#383838] rounded text-xs font-medium transition-colors shrink-0 cursor-pointer"
            title="Open media_pool folder in File Explorer"
          >
            Open Folder
          </button>
        </div>
      </div>

      {/* 2. Media Pool Content Container - Click background to deselect */}
      <div
        onClick={handleBackgroundClick}
        className={`flex-1 overflow-y-auto p-3 transition-colors ${
          isHoveringDrop ? 'bg-[#222222] ring-1 ring-[#555555]' : ''
        }`}
      >
        {filteredAssets.length === 0 ? (
          <div className="h-full w-full" onClick={handleBackgroundClick} />
        ) : viewMode === 'grid' ? (
          /* A. WINDOWS-STYLE FOOTAGE GRID (Independent thumbnail box, text below, no hover buttons) */
          <div
            onClick={handleBackgroundClick}
            className="grid grid-cols-[repeat(auto-fill,104px)] gap-3.5 justify-start content-start min-h-full"
          >
            {filteredAssets.map((asset) => {
              const category = getAssetCategory(asset);
              const isSelected = selectedIds.has(asset.id);

              return (
                <div
                  key={`grid_${asset.id}`}
                  onMouseDown={(e) => {
                    if (e.button === 0) {
                      startHoldTimer(asset.id);
                      pointerCandidateRef.current = {
                        asset,
                        startX: e.clientX,
                        startY: e.clientY,
                      };
                    }
                  }}
                  onMouseUp={clearHoldTimer}
                  onClick={(e) => {
                    clearHoldTimer();
                    handleItemClick(e, asset);
                  }}
                  onDoubleClick={(e) => {
                    clearHoldTimer();
                    handleItemDoubleClick(e, asset);
                  }}
                  onContextMenu={(e) => {
                    clearHoldTimer();
                    handleContextMenu(e, asset);
                  }}
                  className={`w-[104px] group flex flex-col items-center p-1 rounded transition-colors duration-75 select-none ${
                    holdingAssetId === asset.id || draggedAssetId === asset.id
                      ? 'cursor-grabbing'
                      : 'cursor-default'
                  } ${
                    draggedAssetId === asset.id ? 'opacity-40' : ''
                  } ${
                    isSelected
                      ? 'bg-[#212b38] ring-1 ring-[#4870a0]'
                      : 'hover:bg-[#242424]'
                  }`}
                  title={`${asset.name} (Drag to preview or AI slots, double-click to preview)`}
                >
                  {/* Standalone File Thumbnail Box */}
                  <div
                    className={`w-full aspect-[16/10] bg-[#141414] rounded border relative flex items-center justify-center overflow-hidden shadow-xs transition-colors duration-75 ${
                      isSelected
                        ? 'border-[#5588cc]'
                        : 'border-[#303030] group-hover:border-[#4e4e4e]'
                    }`}
                  >
                    {renderThumbnailContent(asset)}

                    {/* Type Badge (Top-Left) */}
                    <div className="absolute top-1 left-1 px-1 py-0.2 bg-black/80 rounded-xs text-[7px] font-mono text-[#a0a0a0] uppercase">
                      {category === 'image' ? 'IMG' : category === 'video' ? 'VID' : category === 'voice' ? 'AUD' : 'TXT'}
                    </div>

                    {/* Duration Badge (Bottom-Left) */}
                    {category !== 'script' && asset.duration && asset.duration > 0 && (
                      <div className="absolute bottom-1 left-1 px-1 py-0.2 bg-black/80 rounded-xs text-[7px] font-mono text-[#a0a0a0]">
                        {formatSeconds(asset.duration)}
                      </div>
                    )}
                  </div>

                  {/* Independent Text Label Below File Box (Windows Style) */}
                  <div className="mt-1.5 w-full text-center px-0.5">
                    <span
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        wordBreak: 'break-word',
                      }}
                      className={`text-[10px] font-mono leading-tight ${
                        isSelected ? 'text-white font-medium' : 'text-[#cccccc] group-hover:text-white'
                      }`}
                      title={asset.name}
                    >
                      {asset.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* B. COMPACT LIST VIEW */
          <div className="flex flex-col gap-1 min-h-full" onClick={handleBackgroundClick}>
            {filteredAssets.map((asset) => {
              const category = getAssetCategory(asset);
              const isSelected = selectedIds.has(asset.id);

              return (
                <div
                  key={`list_${asset.id}`}
                  onMouseDown={(e) => {
                    if (e.button === 0) {
                      startHoldTimer(asset.id);
                      pointerCandidateRef.current = {
                        asset,
                        startX: e.clientX,
                        startY: e.clientY,
                      };
                    }
                  }}
                  onMouseUp={clearHoldTimer}
                  onClick={(e) => {
                    clearHoldTimer();
                    handleItemClick(e, asset);
                  }}
                  onDoubleClick={(e) => {
                    clearHoldTimer();
                    handleItemDoubleClick(e, asset);
                  }}
                  onContextMenu={(e) => {
                    clearHoldTimer();
                    handleContextMenu(e, asset);
                  }}
                  className={`group flex items-center justify-between px-2 py-1.5 rounded bg-[#1c1c1c] border transition-colors duration-75 select-none ${
                    holdingAssetId === asset.id || draggedAssetId === asset.id
                      ? 'cursor-grabbing'
                      : 'cursor-default'
                  } ${
                    draggedAssetId === asset.id ? 'opacity-40' : ''
                  } ${
                    isSelected
                      ? 'bg-[#212b38] border-[#4870a0]'
                      : 'border-[#2a2a2a] hover:border-[#404040] hover:bg-[#232323]'
                  }`}
                  title={`${asset.name} (Drag to preview or AI slots, double-click to preview)`}
                >
                  {/* Left: Tiny Thumbnail & File Name */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-6 h-6 rounded-xs overflow-hidden bg-[#111111] shrink-0 border border-[#333333]">
                      {renderThumbnailContent(asset, true)}
                    </div>

                    <span
                      className={`truncate text-xs font-mono ${
                        isSelected ? 'text-white font-medium' : 'text-[#d0d0d0] group-hover:text-white'
                      }`}
                      title={asset.name}
                    >
                      {asset.name}
                    </span>

                    {/* Category Type Badge */}
                    <span className="px-1 py-0.2 bg-black/60 rounded-xs text-[8px] font-mono text-[#888888] uppercase shrink-0">
                      {category === 'image' ? 'IMG' : category === 'video' ? 'VID' : category === 'voice' ? 'AUD' : 'TXT'}
                    </span>
                  </div>

                  {/* Right: File Size */}
                  <div className="flex items-center gap-2 shrink-0 pl-1">
                    <span className="text-[10px] font-mono text-[#777777]">
                      {formatFileSize(asset.sizeBytes)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Floating Windows-Style Context Menu (Right-Click) */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: Math.min(contextMenu.y, window.innerHeight - 220),
            left: Math.min(contextMenu.x, window.innerWidth - 190),
          }}
          className="z-50 w-44 bg-[#202020] border border-[#3e3e3e] rounded shadow-2xl py-1 select-none text-xs font-mono"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[10px] text-[#777777] border-b border-[#2e2e2e] truncate">
            {contextMenu.asset.name}
          </div>

          {isAssetActive(contextMenu.asset) ? (
            <button
              type="button"
              onClick={() => {
                handleTogglePreview(contextMenu.asset);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-white hover:bg-[#2f2f2f] transition-colors cursor-pointer font-semibold"
            >
              Remove from Preview
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                handleTogglePreview(contextMenu.asset);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-white hover:bg-[#2f2f2f] transition-colors cursor-pointer font-semibold"
            >
              Add to Preview
            </button>
          )}

          <div className="my-1 border-t border-[#2e2e2e]" />

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.asset.path);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-[#cccccc] hover:bg-[#2f2f2f] hover:text-white transition-colors cursor-pointer"
          >
            Copy File Path
          </button>

          <div className="my-1 border-t border-[#2e2e2e]" />

          <button
            type="button"
            onClick={() => {
              if (onRemoveAssets) {
                onRemoveAssets([contextMenu.asset.id]);
              } else {
                onRemoveAsset(contextMenu.asset.id);
              }
              setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(contextMenu.asset.id);
                return next;
              });
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-[#ff7777] hover:bg-[#382222] transition-colors cursor-pointer"
          >
            Delete File
          </button>
        </div>
      )}

      {/* 4. Translucent Floating Ghost for Multi-Click Pointer Drag */}
      {pointerDragAsset && pointerDragCoords && (
        <div
          style={{
            position: 'fixed',
            left: pointerDragCoords.x + 12,
            top: pointerDragCoords.y + 12,
            pointerEvents: 'none',
            zIndex: 99999,
            opacity: 0.8,
          }}
          className="w-[104px] p-1 rounded bg-[#1c2430] border border-[#4870a0] shadow-2xl flex flex-col items-center select-none"
        >
          <div className="w-full aspect-[16/10] bg-[#141414] rounded border border-[#303030] overflow-hidden flex items-center justify-center">
            {renderThumbnailContent(pointerDragAsset, true)}
          </div>
          <div className="mt-1 w-full text-center px-0.5">
            <span className="text-[10px] font-mono text-white truncate block">
              {pointerDragAsset.name}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaPoolTab;
