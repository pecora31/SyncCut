import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { safeConvertFileSrc } from './utils/mediaUtils';
import { SentenceSegment, MediaAsset } from './types';
import { MediaPoolTab } from './components/workspace/MediaPoolTab';
import { AIMatcherTab } from './components/workspace/AIMatcherTab';
import { YouTubeDownloadModal } from './components/workspace/YouTubeDownloadModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { UpdateModal } from './components/modals/UpdateModal';
import { FirstRunSetupModal } from './components/modals/FirstRunSetupModal';
import { ProgramMonitor } from './components/ProgramMonitor';
import { AIPipelineDock, isVideoAsset } from './components/AIPipelineDock';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { useLanguage } from './i18n';

const STORAGE_KEY_ASSETS = 'synccut_media_assets';
const STORAGE_KEY_VOICE = 'synccut_active_voice';
const STORAGE_KEY_SCRIPT = 'synccut_active_script';
const STORAGE_KEY_OUTPUT_DIR = 'synccut_output_dir';
const STORAGE_KEY_FIRST_RUN = 'synccut_media_pool_configured';
const STORAGE_KEY_SEGMENTS = 'synccut_aligned_segments';
const STORAGE_KEY_LEFT_WIDTH = 'synccut_panel_left_width';

export function normalizeAssetPath(filePath?: string | null): string {
  if (!filePath || typeof filePath !== 'string') return '';
  let clean = filePath.replace(/\\/g, '/').trim();
  if (clean.startsWith('//?/')) clean = clean.slice(4);
  return clean;
}

export function cleanDeduplicateAssets(items: MediaAsset[]): MediaAsset[] {
  const seenNames = new Set<string>();
  const result: MediaAsset[] = [];
  for (const item of items) {
    const normName = item.name.toLowerCase().trim();
    if (normName.startsWith('sample_')) continue;
    if (!seenNames.has(normName)) {
      seenNames.add(normName);
      result.push({
        ...item,
        path: normalizeAssetPath(item.path),
      });
    }
  }
  return result;
}

interface DeletedAssetEntry {
  assets: MediaAsset[];
  wasVoicePath?: string;
  wasScriptPath?: string;
  wasFootagePath?: string;
}

function compareAppVersions(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const clean2 = v2.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(clean1.length, clean2.length); i++) {
    const num1 = clean1[i] || 0;
    const num2 = clean2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export const App: React.FC = () => {
  // Workspace Tab: 'pool' (Media Pool) or 'matcher' (AI Storyboard Matcher)
  const [workspaceTab, setWorkspaceTab] = useState<'pool' | 'matcher'>('pool');
  const [isYouTubePopupOpen, setIsYouTubePopupOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState<boolean>(false);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [isFirstRunOpen, setIsFirstRunOpen] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_FIRST_RUN) !== 'true';
  });

  // Silent background check for updates on startup
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const currentVer = await invoke<string>('get_app_version').catch(() => '0.1.3');
        const res = await fetch('https://api.github.com/repos/pecora31/SyncCut/releases/latest', {
          headers: { Accept: 'application/vnd.github.v3+json' },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.tag_name && compareAppVersions(data.tag_name, currentVer) > 0) {
            setUpdateAvailable(data.tag_name);
          }
        }
      } catch {
        // Silently ignore network failures on startup
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const handleConfirmFirstRun = (folder: string) => {
    setOutputDir(folder);
    localStorage.setItem(STORAGE_KEY_OUTPUT_DIR, folder);
    localStorage.setItem(STORAGE_KEY_FIRST_RUN, 'true');
    setIsFirstRunOpen(false);
  };

  // Resizable Panel Dimensions (Left Workspace vs Right Preview)
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LEFT_WIDTH);
      return saved ? parseInt(saved, 10) : 460;
    } catch {
      return 460;
    }
  });

  // Core Project State with strict deduplication on load
  const [assets, setAssets] = useState<MediaAsset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ASSETS);
      const parsed: MediaAsset[] = saved ? JSON.parse(saved) : [];
      return cleanDeduplicateAssets(parsed);
    } catch {
      return [];
    }
  });

  const [activeVoicePath, setActiveVoicePath] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VOICE) || '';
    if (saved.toLowerCase().includes('sample_voice')) return '';
    return saved;
  });

  const [activeScriptPath, setActiveScriptPath] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SCRIPT) || '';
    if (saved.toLowerCase().includes('sample_script')) return '';
    return saved;
  });

  const [outputDir, setOutputDir] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_OUTPUT_DIR) || 'media_pool';
  });

  const [segments, setSegments] = useState<SentenceSegment[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SEGMENTS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Export & Notification State
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Playback & Preview State
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [activeFootagePath, setActiveFootagePath] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentPlaybackTimeRef = useRef<number>(0);
  currentPlaybackTimeRef.current = currentPlaybackTime;

  // Undo Stack for Deleted Assets
  const deletedHistoryRef = useRef<DeletedAssetEntry[]>([]);
  const activeVoicePathRef = useRef(activeVoicePath);
  activeVoicePathRef.current = activeVoicePath;
  const activeScriptPathRef = useRef(activeScriptPath);
  activeScriptPathRef.current = activeScriptPath;
  const activeFootagePathRef = useRef(activeFootagePath);
  activeFootagePathRef.current = activeFootagePath;
  const previewAssetRef = useRef(previewAsset);
  previewAssetRef.current = previewAsset;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const handleRemoveAssets = (idsToRemove: string[]) => {
    const toRemoveSet = new Set(idsToRemove);
    const removed = assetsRef.current.filter((a) => toRemoveSet.has(a.id));
    if (removed.length === 0) return;

    const wasPreview = Boolean(
      previewAssetRef.current && (
        toRemoveSet.has(previewAssetRef.current.id) ||
        removed.some((a) => a.path === previewAssetRef.current?.path)
      )
    );
    const wasFootage = Boolean(
      activeFootagePathRef.current && removed.some((a) => a.path === activeFootagePathRef.current)
    );

    const entry: DeletedAssetEntry = {
      assets: removed,
      wasVoicePath: removed.some((a) => a.path === activeVoicePathRef.current) ? activeVoicePathRef.current : undefined,
      wasScriptPath: removed.some((a) => a.path === activeScriptPathRef.current) ? activeScriptPathRef.current : undefined,
      wasFootagePath: wasFootage ? activeFootagePathRef.current : undefined,
    };

    deletedHistoryRef.current.push(entry);
    setAssets((prev) => prev.filter((a) => !toRemoveSet.has(a.id)));

    // If the deleted file is currently in preview, clear preview immediately
    if (wasPreview || wasFootage) {
      handleClearPreview();
    }

    if (removed.some((a) => a.path === activeVoicePathRef.current)) {
      setActiveVoicePath('');
    }

    if (removed.some((a) => a.path === activeScriptPathRef.current)) {
      setActiveScriptPath('');
    }
  };

  const handleUndoDelete = () => {
    const entry = deletedHistoryRef.current.pop();
    if (!entry || entry.assets.length === 0) return;

    setAssets((prev) => {
      const existingPaths = new Set(prev.map((a) => a.path));
      const toRestore = entry.assets.filter((a) => !existingPaths.has(a.path));
      return [...prev, ...toRestore];
    });

    if (entry.wasVoicePath) {
      setActiveVoicePath(entry.wasVoicePath);
    }
    if (entry.wasScriptPath) {
      setActiveScriptPath(entry.wasScriptPath);
    }
    if (entry.wasFootagePath) {
      setActiveFootagePath(entry.wasFootagePath);
      const matched = entry.assets.find((a) => a.path === entry.wasFootagePath);
      if (matched) setPreviewAsset(matched);
    }
  };

  // Active Drag & Drop State
  const [hoverDropZone, setHoverDropZone] = useState<string | null>(null);

  const handleClearPreview = () => {
    setPreviewAsset(null);
    setActiveFootagePath('');
    setSegments([]);
    localStorage.removeItem(STORAGE_KEY_SEGMENTS);
    setIsPlaying(false);
    setCurrentPlaybackTime(0);
    currentPlaybackTimeRef.current = 0;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  // Scan user's media pool directory and configure window
  useEffect(() => {
    invoke<Array<{
      id: string;
      name: string;
      path: string;
      file_type: string;
      size_bytes: number;
      duration?: number | null;
    }>>('scan_workspace_media', { customDir: outputDir })
      .then((scanned) => {
        if (!scanned || scanned.length === 0) return;

        setAssets((prev) => {
          // 1. Update existing assets with accurate size, duration, and canonical absolute path
          const updated = prev.map((asset) => {
            const match = scanned.find(
              (s) =>
                s.name.toLowerCase() === asset.name.toLowerCase() ||
                normalizeAssetPath(s.path).toLowerCase() === normalizeAssetPath(asset.path).toLowerCase()
            );
            if (match) {
              return {
                ...asset,
                path: normalizeAssetPath(match.path),
                sizeBytes: match.size_bytes > 0 ? match.size_bytes : asset.sizeBytes,
                duration: match.duration || asset.duration,
              };
            }
            return {
              ...asset,
              path: normalizeAssetPath(asset.path),
            };
          });

          // 2. Add scanned items not yet in updated
          const existingNames = new Set(updated.map((a) => a.name.toLowerCase()));
          const newItems: MediaAsset[] = [];
          for (const item of scanned) {
            const norm = item.name.toLowerCase();
            if (norm.startsWith('sample_')) continue;
            if (!existingNames.has(norm)) {
              newItems.push({
                id: item.id,
                name: item.name,
                path: normalizeAssetPath(item.path),
                fileType: item.file_type as any,
                sizeBytes: item.size_bytes,
                duration: item.duration || undefined,
              });
              existingNames.add(norm);
            }
          }

          const deduped = cleanDeduplicateAssets([...updated, ...newItems]);
          return deduped;
        });
      })
      .catch((err) => console.warn('Workspace media scan failed:', err));

    // Ensure comfortable wide NLE layout (1400x860) matching user preference
    try {
      const appWindow = getCurrentWindow();
      appWindow.innerSize().then((size) => {
        if (size.width < 1300 || size.height < 800) {
          appWindow.setSize(new LogicalSize(1400, 860)).catch(() => {});
          appWindow.center().catch(() => {});
        }
      }).catch(() => {
        appWindow.setSize(new LogicalSize(1400, 860)).catch(() => {});
        appWindow.center().catch(() => {});
      });
    } catch (e) {
      console.warn('Window resize error:', e);
    }
  }, []);

  // Global dragover listener to prevent forbidden cursor
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    window.addEventListener('dragover', handleGlobalDragOver);

    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
    };
  }, []);

  // Listen to native Windows Explorer file drop events
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupDropListener = async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onDragDropEvent(async (event) => {
          if (event.payload.type === 'drop') {
            const rawPaths: string[] = event.payload.paths;
            if (!rawPaths || rawPaths.length === 0) return;

            try {
              const fileInfos = await invoke<Array<{
                id: string;
                name: string;
                path: string;
                fileType: string;
                sizeBytes: number;
                duration?: number | null;
              }>>('get_batch_files_media_info', { paths: rawPaths });

              if (fileInfos && fileInfos.length > 0) {
                const newAssets: MediaAsset[] = fileInfos.map((f) => ({
                  id: f.id,
                  name: f.name,
                  path: normalizeAssetPath(f.path),
                  fileType: f.fileType as any,
                  sizeBytes: f.sizeBytes,
                  duration: f.duration || undefined,
                }));

                setAssets((prev) => {
                  return cleanDeduplicateAssets([...prev, ...newAssets]);
                });

                // Auto mount slots if currently empty
                const firstVoice = newAssets.find((a) => a.fileType === 'voice');
                if (firstVoice && !activeVoicePathRef.current) {
                  setActiveVoicePath(firstVoice.path);
                }

                const firstScript = newAssets.find((a) => a.fileType === 'script');
                if (firstScript && !activeScriptPathRef.current) {
                  setActiveScriptPath(firstScript.path);
                }

                const firstVideo = newAssets.find((a) => a.fileType === 'video');
                if (firstVideo && !previewAssetRef.current) {
                  setPreviewAsset(firstVideo);
                  setActiveFootagePath(firstVideo.path);
                }

                setExportMessage(`Imported ${newAssets.length} file(s) into Media Pool`);
              }
            } catch (err) {
              console.error('Failed to parse dropped files:', err);
            }
          }
        });
      } catch (err) {
        console.warn('Could not register native onDragDropEvent:', err);
      }
    };

    setupDropListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Auto-dismiss export message notification after 4s
  useEffect(() => {
    if (exportMessage) {
      const timer = setTimeout(() => setExportMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [exportMessage]);

  // Compute Total Duration
  const totalDuration = React.useMemo(() => {
    if (previewAsset) {
      return previewAsset.duration && previewAsset.duration > 0 ? previewAsset.duration : 0;
    }
    if (segments.length > 0) {
      return Math.max(...segments.map((s) => s.endTime));
    }
    const voiceAsset = assets.find((a) => a.path === activeVoicePath);
    if (voiceAsset && voiceAsset.duration) {
      return voiceAsset.duration;
    }
    return 0;
  }, [segments, assets, activeVoicePath, previewAsset]);

  // Persist State to LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ASSETS, JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VOICE, activeVoicePath);
  }, [activeVoicePath]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SCRIPT, activeScriptPath);
  }, [activeScriptPath]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_OUTPUT_DIR, outputDir);
  }, [outputDir]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SEGMENTS, JSON.stringify(segments));
  }, [segments]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LEFT_WIDTH, leftWidth.toString());
  }, [leftWidth]);


  // Synchronize Audio Playback & Clock for Timeline Mode
  useEffect(() => {
    if (!isPlaying) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      return;
    }

    // In direct asset preview mode, ProgramMonitor's video element is the master clock!
    if (previewAsset) {
      return;
    }

    const shouldPlayVoice = Boolean(activeVoicePath && segments.length > 0);
    if (shouldPlayVoice && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }

    let lastTimestamp = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const delta = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      if (shouldPlayVoice && audioRef.current && !audioRef.current.paused) {
        const audioTime = audioRef.current.currentTime;
        currentPlaybackTimeRef.current = audioTime;
        setCurrentPlaybackTime(audioTime);
        if (totalDuration > 0 && audioTime >= totalDuration) {
          setIsPlaying(false);
          return;
        }
      } else {
        const nextTime = currentPlaybackTimeRef.current + delta;
        if (totalDuration > 0 && nextTime >= totalDuration) {
          currentPlaybackTimeRef.current = totalDuration;
          setCurrentPlaybackTime(totalDuration);
          setIsPlaying(false);
          return;
        } else {
          currentPlaybackTimeRef.current = nextTime;
          setCurrentPlaybackTime(nextTime);
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, activeVoicePath, totalDuration, previewAsset, segments.length]);

  const handleTimeUpdate = (time: number) => {
    currentPlaybackTimeRef.current = time;
    setCurrentPlaybackTime(time);
  };

  const handleSeek = (time: number, autoPlay: boolean = false) => {
    const maxDur = totalDuration > 0 ? totalDuration : (previewAsset?.duration || 0);
    const safeTime = maxDur > 0 ? Math.max(0, Math.min(maxDur, time)) : Math.max(0, time);
    currentPlaybackTimeRef.current = safeTime;
    setCurrentPlaybackTime(safeTime);
    if (audioRef.current && !previewAsset) {
      audioRef.current.currentTime = safeTime;
    }
    if (autoPlay && !isPlaying) {
      setIsPlaying(true);
    }
  };

  const handleTogglePlay = () => {
    if (totalDuration > 0 && currentPlaybackTimeRef.current >= totalDuration) {
      handleSeek(0);
    }
    setIsPlaying((prev) => !prev);
  };


  // Global Keyboard Shortcuts (Space = Play/Pause, Left/Right = -5s/+5s, J/L = -5s/+5s)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        handleUndoDelete();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        handleSeek(Math.max(0, currentPlaybackTimeRef.current - 5));
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleSeek(Math.min(totalDuration, currentPlaybackTimeRef.current + 5));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalDuration, isPlaying]);

  const handlePickOutputDir = async () => {
    try {
      const selected = await invoke<string | null>('pick_directory_output');
      if (selected) {
        setOutputDir(selected);
      }
    } catch (e) {
      console.warn('Pick output dir error:', e);
    }
  };


  const handleExportPremiereXml = async () => {
    if (segments.length === 0 || !activeVoicePath) {
      setExportMessage('Assign voiceover and run AI Matcher first');
      return;
    }

    setIsExporting(true);
    setExportMessage('Exporting Premiere Pro XML...');

    try {
      const savedPath = await invoke<string>('export_premiere_xml_dialog', {
        voicePath: activeVoicePath,
        segments,
        fps: 30.0,
      });
      setExportMessage(`Exported: ${savedPath.split(/[/\\]/).pop()}`);
    } catch (err: any) {
      if (err !== 'Export cancelled.') {
        console.error('Export XML error:', err);
        setExportMessage(err?.toString() || 'Failed to export XML');
      } else {
        setExportMessage(null);
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Drag handlers for Column Splitter (Left vs Right)
  const handleColResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(260, Math.min(window.innerWidth - 320, startWidth + deltaX));
      setLeftWidth(newWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };


  const { language, setLanguage, t } = useLanguage();
  const canExport = segments.length > 0 && Boolean(activeVoicePath);
  const brollAssets = assets.filter((a) => a.fileType === 'video');

  return (
    <div className="h-screen w-screen bg-[#181818] text-[#e6e6e6] flex flex-col font-sans overflow-hidden select-none">
      {/* Hidden Audio Player for Voiceover Sync */}
      <audio
        ref={audioRef}
        src={
          (!previewAsset && segments.length > 0 && activeVoicePath) ||
          (previewAsset?.fileType === 'voice' && previewAsset.path)
            ? safeConvertFileSrc(previewAsset?.fileType === 'voice' ? previewAsset.path : activeVoicePath)
            : undefined
        }
        onTimeUpdate={() => {
          if (audioRef.current && isPlaying && (!previewAsset || previewAsset.fileType === 'voice')) {
            setCurrentPlaybackTime(audioRef.current.currentTime);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentPlaybackTime(totalDuration);
        }}
      />

      {/* 1. Header Bar */}
      <header className="h-10 bg-[#1f1f1f] border-b border-[#303030] px-3 flex items-center justify-between select-none shrink-0 z-20">
        {/* Left: App Control Buttons (Settings & Update) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="px-3 py-1 bg-[#262626] hover:bg-[#333333] text-white text-xs font-medium rounded border border-[#3e3e3e] transition-colors cursor-pointer"
            title={language === 'vi' ? 'Cài đặt thông số cơ bản' : 'Application Settings'}
          >
            {language === 'vi' ? 'Cài đặt' : 'Settings'}
          </button>

          <button
            type="button"
            onClick={() => setIsUpdateOpen(true)}
            className="px-3 py-1 bg-[#262626] hover:bg-[#333333] text-white text-xs font-medium rounded border border-[#3e3e3e] transition-colors cursor-pointer flex items-center gap-1.5"
            title={language === 'vi' ? 'Kiểm tra cập nhật tự động từ GitHub' : 'Check for Updates'}
          >
            <span>{language === 'vi' ? 'Cập nhật' : 'Check Update'}</span>
            {updateAvailable && (
              <span className="bg-white text-black text-[10px] px-1 font-bold rounded font-mono">
                {updateAvailable}
              </span>
            )}
          </button>
        </div>

        {/* Right: Action (Language switch & Export Premiere XML) */}
        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <div className="flex items-center bg-[#181818] border border-[#333333] rounded text-[11px] font-mono select-none mr-1">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2 py-0.5 rounded-xs transition-colors cursor-pointer ${
                language === 'en' ? 'bg-[#333333] text-white font-semibold' : 'text-[#888888] hover:text-[#cccccc]'
              }`}
              title="English"
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage('vi')}
              className={`px-2 py-0.5 rounded-xs transition-colors cursor-pointer ${
                language === 'vi' ? 'bg-[#333333] text-white font-semibold' : 'text-[#888888] hover:text-[#cccccc]'
              }`}
              title="Tiếng Việt"
            >
              VI
            </button>
          </div>

          {exportMessage && (
            <span className="text-[11px] text-[#a0a0a0] font-mono pr-2 truncate max-w-[320px]">
              {exportMessage}
            </span>
          )}

          <button
            type="button"
            disabled={!canExport || isExporting}
            onClick={handleExportPremiereXml}
            className="px-3.5 py-1.5 bg-[#333333] hover:bg-[#404040] disabled:bg-[#202020] disabled:text-[#555555] text-white text-xs font-semibold rounded border border-[#666666] transition-colors shadow-sm cursor-pointer"
            title="Export synchronized timeline as Adobe Premiere Pro XML"
          >
            {isExporting ? t.exporting : t.exportXml}
          </button>
        </div>
      </header>

      {/* Update Notification Banner */}
      {updateAvailable && (
        <div className="h-8 bg-[#202020] border-b border-[#3e3e3e] px-4 flex items-center justify-between text-xs font-sans select-none shrink-0 z-20">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">
              {language === 'vi'
                ? `Phiên bản mới khả dụng: ${updateAvailable}`
                : `New version available: ${updateAvailable}`}
            </span>
            <span className="text-[#888888] text-[11px] hidden sm:inline">
              {language === 'vi'
                ? '— Nhấp để cập nhật tự động và khởi động lại'
                : '— Click to auto-update and relaunch'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsUpdateOpen(true)}
              className="px-2.5 py-0.5 bg-white text-black font-semibold rounded hover:bg-[#e0e0e0] transition-colors cursor-pointer text-[11px]"
            >
              {language === 'vi' ? 'Cập nhật ngay' : 'Update Now'}
            </button>
            <button
              type="button"
              onClick={() => setUpdateAvailable(null)}
              className="text-[#888888] hover:text-white px-1 text-xs cursor-pointer"
              title="Dismiss"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* 2. Clean 2-Pane Workspace & Preview Layout */}
      <main className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* LEFT WORKSPACE: Resizable Width */}
        <section
          className="bg-[#1a1a1a] flex flex-col h-full overflow-hidden shrink-0"
          style={{ width: `${leftWidth}px` }}
          onDragOver={(e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            const unmountSlot = e.dataTransfer.getData('unmount-slot');
            if (unmountSlot === 'voice') {
              e.preventDefault();
              setActiveVoicePath('');
              setExportMessage('Voiceover unmounted');
            } else if (unmountSlot === 'script') {
              e.preventDefault();
              setActiveScriptPath('');
              setExportMessage('Script unmounted');
            } else if (unmountSlot === 'footage' || unmountSlot === 'video') {
              e.preventDefault();
              handleClearPreview();
              setExportMessage('Footage preview unmounted');
            }
          }}
        >
          {/* Workplace Tab Navigation Bar - Docked Flush (No Gap) */}
          <div className="h-8 bg-[#181818] border-b border-[#2e2e2e] flex items-end px-3 gap-1 shrink-0 select-none">
            <button
              type="button"
              onClick={() => setWorkspaceTab('pool')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-sm transition-colors cursor-pointer focus:outline-none ${
                workspaceTab === 'pool'
                  ? 'bg-[#1e1e1e] text-white border-t border-l border-r border-[#2e2e2e] border-b border-b-[#1e1e1e] -mb-px relative z-10'
                  : 'bg-transparent text-[#888888] hover:text-white border-t border-l border-r border-transparent mb-0'
              }`}
            >
              {t.mediaPool} ({assets.length})
            </button>

            <button
              type="button"
              onClick={() => setWorkspaceTab('matcher')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-sm transition-colors cursor-pointer focus:outline-none ${
                workspaceTab === 'matcher'
                  ? 'bg-[#1e1e1e] text-white border-t border-l border-r border-[#2e2e2e] border-b border-b-[#1e1e1e] -mb-px relative z-10'
                  : 'bg-transparent text-[#888888] hover:text-white border-t border-l border-r border-transparent mb-0'
              }`}
            >
              {t.aiMatcher}
            </button>
          </div>

          {/* Workplace Content Container */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {workspaceTab === 'pool' ? (
              <MediaPoolTab
                assets={assets}
                segments={segments}
                activeVoicePath={activeVoicePath}
                activeScriptPath={activeScriptPath}
                onSelectVoice={(path) => setActiveVoicePath(path)}
                onSelectScript={(path) => setActiveScriptPath(path)}
                onSelectFootage={(path) => setActiveFootagePath(path)}
                onPreviewAsset={(asset) => {
                  setPreviewAsset(asset);
                  if (isVideoAsset(asset) || asset.fileType === 'image') {
                    setActiveFootagePath(asset.path);
                  }
                  setCurrentPlaybackTime(0);
                  currentPlaybackTimeRef.current = 0;
                  setIsPlaying(false);
                }}
                onAddAssets={(newAssets) => {
                  setAssets((prev) => {
                    const existingPaths = new Set(prev.map((a) => a.path));
                    const filtered = newAssets.filter((a) => !existingPaths.has(a.path));
                    return [...prev, ...filtered];
                  });
                }}
                onRemoveAsset={(id) => handleRemoveAssets([id])}
                onRemoveAssets={handleRemoveAssets}
                onOpenYouTubePopup={() => setIsYouTubePopupOpen(true)}
                previewAsset={previewAsset}
                onClearPreview={handleClearPreview}
                setHoverDropZone={setHoverDropZone}
              />
            ) : (
              <div className="h-full p-2.5 bg-[#1e1e1e] overflow-y-auto">
                <AIMatcherTab
                  activeVoicePath={activeVoicePath}
                  activeScriptPath={activeScriptPath}
                  brollAssets={brollAssets}
                  segments={segments}
                  outputDir={outputDir}
                  onSegmentsMatched={(matched) => {
                    setSegments(matched);
                    if (matched.length > 0) {
                      setCurrentPlaybackTime(0);
                    }
                  }}
                  onSelectSegment={(seg) => {
                    setPreviewAsset(null);
                    handleSeek(seg.startTime);
                  }}
                  onNavigateToMediaPool={() => setWorkspaceTab('pool')}
                />
              </div>
            )}
          </div>
        </section>

        {/* DRAGGABLE VERTICAL COLUMN SPLITTER (Resizes Left vs Right) */}
        <div
          onMouseDown={handleColResizeMouseDown}
          className="w-[3px] bg-[#262626] hover:bg-[#4f4f4f] active:bg-[#666666] cursor-col-resize transition-colors select-none z-20 shrink-0"
          title="Drag to resize panel width"
        />

        {/* RIGHT PREVIEW MONITOR: Flexible Width */}
        <section className="flex-1 min-w-0 bg-[#121212] flex flex-col h-full overflow-hidden">
          {/* Scientific Modular AI Pipeline Slotting Dock */}
          <AIPipelineDock
            assets={assets}
            activeVoicePath={activeVoicePath}
            activeScriptPath={activeScriptPath}
            activeFootagePath={activeFootagePath}
            onSelectFootage={(path) => {
              setActiveFootagePath(path);
              const matched = assets.find((a) => a.path === path);
              if (matched) {
                setPreviewAsset(matched);
                setCurrentPlaybackTime(0);
                currentPlaybackTimeRef.current = 0;
                setIsPlaying(false);
              } else {
                setPreviewAsset(null);
              }
            }}
            segments={segments}
            outputDir={outputDir}
            hoverDropZone={hoverDropZone}
            onSelectVoice={(path) => {
              setActiveVoicePath(path);
            }}
            onSelectScript={(path) => {
              setActiveScriptPath(path);
            }}
            onLoadToPreview={(asset) => {
              if (isVideoAsset(asset) || asset.fileType === 'image') {
                setPreviewAsset(asset);
                setCurrentPlaybackTime(0);
                currentPlaybackTimeRef.current = 0;
                setIsPlaying(false);
              }
            }}
            onClearPreview={handleClearPreview}
            onAddAssets={(newAssets) => {
              setAssets((prev) => {
                const existingPaths = new Set(prev.map((a) => a.path));
                const filtered = newAssets.filter((a) => !existingPaths.has(a.path));
                return [...prev, ...filtered];
              });
            }}
            onSegmentsMatched={(matched) => {
              setSegments(matched);
              if (matched.length > 0) {
                setCurrentPlaybackTime(0);
              }
            }}
          />

          <ProgramMonitor
            segments={segments}
            currentPlaybackTime={currentPlaybackTime}
            totalDuration={totalDuration}
            isPlaying={isPlaying}
            fps={30}
            previewAsset={previewAsset}
            hoverDropZone={hoverDropZone}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            onTimeUpdate={handleTimeUpdate}
            onClearPreview={handleClearPreview}
            onAddAssets={(newAssets) => {
              setAssets((prev) => {
                const existingPaths = new Set(prev.map((a) => a.path));
                const filtered = newAssets.filter((a) => !existingPaths.has(a.path));
                return [...prev, ...filtered];
              });
            }}
            onLoadToPreview={(asset) => {
              if (asset.fileType === 'voice') {
                setActiveVoicePath(asset.path);
              } else if (asset.fileType === 'script') {
                setActiveScriptPath(asset.path);
              } else {
                setPreviewAsset(asset);
                setActiveFootagePath(asset.path);
                setCurrentPlaybackTime(0);
                currentPlaybackTimeRef.current = 0;
                setIsPlaying(false);
              }
            }}
            onSelectVoice={(path) => {
              setActiveVoicePath(path);
            }}
            onSelectScript={(path) => {
              setActiveScriptPath(path);
            }}
          />
        </section>
      </main>

      {/* 3. Floating YouTube Downloader Modal (Non-blurring background) */}
      <YouTubeDownloadModal
        isOpen={isYouTubePopupOpen}
        outputDir={outputDir}
        onClose={() => setIsYouTubePopupOpen(false)}
        onPickOutputDir={handlePickOutputDir}
        onMediaDownloaded={(newAsset) => {
          const absAsset: MediaAsset = {
            ...newAsset,
            path: normalizeAssetPath(newAsset.path),
          };
          setAssets((prev) => {
            const updated = prev.filter((a) => a.name.toLowerCase() !== absAsset.name.toLowerCase());
            return cleanDeduplicateAssets([...updated, absAsset]);
          });
          setIsYouTubePopupOpen(false);
          setExportMessage(`Downloaded: ${absAsset.name}`);
        }}
      />

      {/* 4. Application Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        outputDir={outputDir}
        onClose={() => setIsSettingsOpen(false)}
        onPickOutputDir={handlePickOutputDir}
      />

      {/* 5. Software Update Modal (GitHub Releases) */}
      <UpdateModal
        isOpen={isUpdateOpen}
        onClose={() => setIsUpdateOpen(false)}
      />

      {/* 6. First Run Media Pool Setup Modal */}
      <FirstRunSetupModal
        isOpen={isFirstRunOpen}
        currentFolder={outputDir}
        onConfirm={handleConfirmFirstRun}
      />

      {/* 7. Global Notification Toast */}
      {exportMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#1e1e1e] text-white border border-[#3e3e3e] shadow-2xl rounded px-4 py-2.5 flex items-center gap-3 text-xs font-mono select-none">
          <span className="text-[#e6e6e6]">{exportMessage}</span>
          <button
            type="button"
            onClick={() => setExportMessage(null)}
            className="text-[#888888] hover:text-white cursor-pointer ml-2 text-[10px] font-bold"
          >
            DISMISS
          </button>
        </div>
      )}

    </div>
  );
};

export default App;
