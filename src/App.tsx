import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ProjectBin } from './components/ProjectBin';
import { ProgramMonitor } from './components/ProgramMonitor';
import { TimelineTrackView } from './components/TimelineTrackView';
import { ProjectConfig, SentenceSegment, InterleavingSettings, ProcessingLog } from './types';
import { invoke } from '@tauri-apps/api/core';
import { Terminal, ChevronUp, ChevronDown } from 'lucide-react';

const STORAGE_KEY_CONFIG = 'synccut_project_config';
const STORAGE_KEY_SETTINGS = 'synccut_interleaving_settings';
const STORAGE_KEY_SEGMENTS = 'synccut_aligned_segments';

export const App: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'ready' | 'completed' | 'error'>('idle');
  
  // State with LocalStorage persistence to prevent refresh reset
  const [config, setConfig] = useState<ProjectConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      return saved ? JSON.parse(saved) : { voicePath: '', scriptPath: '', outputDir: '', youtubeUrls: [], imagesDir: '' };
    } catch {
      return { voicePath: '', scriptPath: '', outputDir: '', youtubeUrls: [], imagesDir: '' };
    }
  });

  const [settings, setSettings] = useState<InterleavingSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      return saved ? JSON.parse(saved) : { videoRatio: 70, pattern: 'ratio', minSceneDuration: 2.5, maxSceneDuration: 6.0, fps: 30 };
    } catch {
      return { videoRatio: 70, pattern: 'ratio', minSceneDuration: 2.5, maxSceneDuration: 6.0, fps: 30 };
    }
  });

  const [segments, setSegments] = useState<SentenceSegment[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SEGMENTS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [isLogOpen, setIsLogOpen] = useState(false);

  // Playback & Timeline Scrubber State
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const playbackIntervalRef = useRef<any>(null);

  // Calculate total timeline duration
  const totalDuration = segments.length > 0 ? segments[segments.length - 1].endTime : 15.0;

  // Persist State
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SEGMENTS, JSON.stringify(segments));
  }, [segments]);

  // Real-time Playback Timer
  useEffect(() => {
    if (isPlaying) {
      playbackIntervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.05;
        });
      }, 50);
    } else {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    }
    return () => {
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    };
  }, [isPlaying, totalDuration]);

  const addLog = (stage: ProcessingLog['stage'], message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ timestamp: time, stage, message }, ...prev]);
  };

  const handlePickVoice = async () => {
    try {
      const selected = await invoke<string | null>('pick_file_voice');
      if (selected) {
        setConfig((prev) => ({ ...prev, voicePath: selected }));
        addLog('idle', `Selected voice file: ${selected}`);
      }
    } catch (e) {
      console.warn('File dialog fallback:', e);
    }
  };

  const handlePickScript = async () => {
    try {
      const selected = await invoke<string | null>('pick_file_script');
      if (selected) {
        setConfig((prev) => ({ ...prev, scriptPath: selected }));
        addLog('idle', `Selected script file: ${selected}`);
      }
    } catch (e) {
      console.warn('File dialog fallback:', e);
    }
  };

  const handlePickOutputDir = async () => {
    try {
      const selected = await invoke<string | null>('pick_directory_output');
      if (selected) {
        setConfig((prev) => ({ ...prev, outputDir: selected }));
        addLog('idle', `Selected output directory: ${selected}`);
      }
    } catch (e) {
      console.warn('File dialog fallback:', e);
    }
  };

  const handlePickImagesDir = async () => {
    try {
      const selected = await invoke<string | null>('pick_directory_images');
      if (selected) {
        setConfig((prev) => ({ ...prev, imagesDir: selected }));
        addLog('idle', `Selected images folder: ${selected}`);
      }
    } catch (e) {
      console.warn('File dialog fallback:', e);
    }
  };

  const handleLoadDemo = async () => {
    try {
      const demo = await invoke<{ voicePath: string; scriptPath: string; outputDir: string; brollPath: string }>('load_demo_project');
      if (demo) {
        setConfig({
          voicePath: demo.voicePath,
          scriptPath: demo.scriptPath,
          outputDir: demo.outputDir,
          youtubeUrls: [],
          imagesDir: '',
        });
        addLog('completed', 'Loaded demo project assets! Ready to export.');
      }
    } catch (e) {
      console.warn('Demo load error:', e);
      addLog('error', `Failed to load demo: ${e}`);
    }
  };

  const handleToggleAssetType = (id: number) => {
    setSegments((prev) =>
      prev.map((seg) =>
        seg.id === id
          ? { ...seg, assetType: seg.assetType === 'video' ? 'image' : 'video' }
          : seg
      )
    );
  };

  const handleReset = () => {
    setStatus('idle');
    setSegments([]);
    setLogs([]);
    setCurrentTime(0);
    setIsPlaying(false);
    localStorage.removeItem(STORAGE_KEY_CONFIG);
    localStorage.removeItem(STORAGE_KEY_SETTINGS);
    localStorage.removeItem(STORAGE_KEY_SEGMENTS);
  };

  const handleOpenFolder = async () => {
    if (!config.outputDir) return;
    try {
      await invoke('open_directory', { path: config.outputDir });
    } catch (e) {
      console.warn('Open folder error:', e);
    }
  };

  const handleProcessAndExport = async () => {
    if (!config.voicePath || !config.scriptPath || !config.outputDir) {
      addLog('error', 'Please link Voice MP4, Script TXT, and Output Directory first!');
      return;
    }

    setStatus('processing');
    addLog('downloading', 'Starting SyncCut AI pipeline & Premiere XML generation...');

    try {
      const resultSegments = await invoke<SentenceSegment[]>('execute_pipeline', {
        config,
        settings,
      });

      setSegments(resultSegments);
      setStatus('completed');
      setCurrentTime(0);
      addLog('completed', `Success! Exported Premiere XML with ${resultSegments.length} synchronized scenes.`);
    } catch (e: any) {
      console.error('Pipeline error:', e);
      addLog('error', `Error executing pipeline: ${e?.toString() || 'Unknown error'}`);
      setStatus('error');
    }
  };

  const handleRenderVideo = async () => {
    if (segments.length === 0 || !config.outputDir) return;
    setIsRendering(true);
    addLog('downloading', 'Rendering preview video with FFmpeg (slicing & merging)...');

    try {
      const renderedPath = await invoke<string>('render_preview_video', {
        config,
        segments,
      });
      addLog('completed', `Rendered video ready: ${renderedPath}`);
      await invoke('open_file', { path: renderedPath });
    } catch (e: any) {
      console.error('Render error:', e);
      addLog('error', `Render failed: ${e?.toString() || 'FFmpeg error'}`);
    } finally {
      setIsRendering(false);
    }
  };

  const canProcess = Boolean(config.voicePath && config.scriptPath && config.outputDir);

  return (
    <div className="h-screen w-screen bg-[#0d1117] text-[#f0f6fc] flex flex-col font-sans overflow-hidden select-none">
      {/* 1. Premiere Pro Workspace Top Header */}
      <Header
        status={status}
        onReset={handleReset}
        onOpenOutput={handleOpenFolder}
        onLoadDemo={handleLoadDemo}
        onProcessAndExport={handleProcessAndExport}
        onRenderVideo={handleRenderVideo}
        isProcessing={status === 'processing'}
        isRendering={isRendering}
        hasOutput={Boolean(config.outputDir && (status === 'completed' || segments.length > 0))}
        currentTime={currentTime}
        fps={settings.fps}
        canProcess={canProcess}
      />

      {/* 2. Main Workspace Layout */}
      <main className="flex-1 p-2 grid grid-rows-12 gap-2 overflow-hidden">
        {/* UPPER HALF (Row 1-7): Project Bin (Left) + Program Monitor (Right) */}
        <div className="row-span-7 grid grid-cols-12 gap-2 overflow-hidden">
          {/* Top Left: Project Bin & Settings (5 cols) */}
          <div className="col-span-5 h-full overflow-hidden">
            <ProjectBin
              config={config}
              settings={settings}
              segments={segments}
              currentPlaybackTime={currentTime}
              onConfigChange={setConfig}
              onSettingsChange={setSettings}
              onPickVoice={handlePickVoice}
              onPickScript={handlePickScript}
              onPickOutputDir={handlePickOutputDir}
              onPickImagesDir={handlePickImagesDir}
              onSelectSegmentTime={(t) => setCurrentTime(t)}
              disabled={status === 'processing'}
            />
          </div>

          {/* Top Right: Program Monitor / Video Preview (7 cols) */}
          <div className="col-span-7 h-full overflow-hidden">
            <ProgramMonitor
              segments={segments}
              currentPlaybackTime={currentTime}
              totalDuration={totalDuration}
              isPlaying={isPlaying}
              fps={settings.fps}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onSeek={(t) => setCurrentTime(t)}
            />
          </div>
        </div>

        {/* LOWER HALF (Row 8-12): Multi-Track Premiere Timeline */}
        <div className="row-span-5 h-full overflow-hidden">
          <TimelineTrackView
            segments={segments}
            currentPlaybackTime={currentTime}
            totalDuration={totalDuration}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            onSeek={(t) => setCurrentTime(t)}
            onToggleAssetType={handleToggleAssetType}
          />
        </div>
      </main>

      {/* 3. Collapsible Console Log Drawer at Footer */}
      <footer className="h-7 border-t border-[#30363d] bg-[#161b22] px-3 flex items-center justify-between text-[11px] font-mono relative">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLogOpen((o) => !o)}
            className="flex items-center gap-1 text-[#8b949e] hover:text-[#f0f6fc] font-mono"
          >
            <Terminal className="w-3 h-3 text-[#58a6ff]" />
            <span>Console ({logs.length})</span>
            {isLogOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>

          {logs.length > 0 && (
            <span className="text-[#8b949e] truncate max-w-[500px]">
              - {logs[0].message}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[#6e7681]">
          <span>SyncCut v0.1.0 NLE Workspace</span>
        </div>

        {/* Expanded Console Drawer Popup */}
        {isLogOpen && (
          <div className="absolute bottom-7 left-0 right-0 h-44 bg-[#0d1117] border-t border-[#30363d] p-2.5 overflow-y-auto z-50 flex flex-col gap-1 shadow-2xl">
            {logs.map((l, i) => (
              <div key={i} className="flex items-start gap-2 leading-relaxed">
                <span className="text-[#6e7681]">[{l.timestamp}]</span>
                <span
                  className={
                    l.stage === 'error'
                      ? 'text-[#f85149]'
                      : l.stage === 'completed'
                      ? 'text-[#3fb950]'
                      : l.stage === 'downloading'
                      ? 'text-[#e3b341]'
                      : 'text-[#c9d1d9]'
                  }
                >
                  {l.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
};

export default App;
