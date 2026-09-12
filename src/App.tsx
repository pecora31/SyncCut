import React, { useState } from 'react';
import { Header } from './components/Header';
import { AssetInputPanel } from './components/AssetInputPanel';
import { PacingControls } from './components/PacingControls';
import { TimelineVisualizer } from './components/TimelineVisualizer';
import { ExportPanel } from './components/ExportPanel';
import { ProjectConfig, SentenceSegment, InterleavingSettings, ProcessingLog } from './types';
import { invoke } from '@tauri-apps/api/core';

export const App: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'ready' | 'completed' | 'error'>('idle');
  const [config, setConfig] = useState<ProjectConfig>({
    voicePath: '',
    scriptPath: '',
    outputDir: '',
    youtubeUrls: [],
    imagesDir: '',
  });

  const [settings, setSettings] = useState<InterleavingSettings>({
    videoRatio: 70,
    pattern: 'ratio',
    minSceneDuration: 2.5,
    maxSceneDuration: 6.0,
    fps: 30,
  });

  const [segments, setSegments] = useState<SentenceSegment[]>([]);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);

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
      console.warn('Native dialog failed or web mode, using fallback:', e);
      // Fallback mock path for development
      const mock = 'C:\\Mock\\voiceover_sample.mp4';
      setConfig((prev) => ({ ...prev, voicePath: mock }));
      addLog('idle', `[Dev Fallback] Selected: ${mock}`);
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
      console.warn('Native dialog failed or web mode, using fallback:', e);
      const mock = 'C:\\Mock\\kịch_bản_mẫu.txt';
      setConfig((prev) => ({ ...prev, scriptPath: mock }));
      addLog('idle', `[Dev Fallback] Selected: ${mock}`);
    }
  };

  const handlePickOutputDir = async () => {
    try {
      const selected = await invoke<string | null>('pick_directory_output');
      if (selected) {
        setConfig((prev) => ({ ...prev, outputDir: selected }));
        addLog('idle', `Selected output workspace: ${selected}`);
      }
    } catch (e) {
      console.warn('Native dialog failed or web mode, using fallback:', e);
      const mock = 'C:\\Mock\\PremiereProjectOutput';
      setConfig((prev) => ({ ...prev, outputDir: mock }));
      addLog('idle', `[Dev Fallback] Selected: ${mock}`);
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
      console.warn('Native dialog failed or web mode, using fallback:', e);
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
  };

  const handleOpenFolder = async () => {
    if (!config.outputDir) return;
    try {
      await invoke('open_directory', { path: config.outputDir });
    } catch (e) {
      console.warn('Failed to open folder:', e);
    }
  };

  const handleProcessAndExport = async () => {
    if (!config.voicePath || !config.scriptPath || !config.outputDir) {
      addLog('error', 'Please provide Voice MP4, Script TXT, and Output Directory before starting!');
      return;
    }

    setStatus('processing');
    addLog('downloading', 'Starting SyncCut pipeline...');

    try {
      // Step 1: Call Rust backend to execute pipeline
      addLog('downloading', 'Step 1/4: Checking source assets & downloading YouTube B-roll...');
      
      const resultSegments = await invoke<SentenceSegment[]>('execute_pipeline', {
        config,
        settings,
      });

      setSegments(resultSegments);
      setStatus('completed');
      addLog('completed', `Success! Generated Premiere XML with ${resultSegments.length} aligned scenes.`);
    } catch (e: any) {
      console.error('Pipeline error:', e);
      addLog('error', `Error executing pipeline: ${e?.toString() || 'Unknown error'}`);
      setStatus('error');
    }
  };

  const canProcess = Boolean(config.voicePath && config.scriptPath && config.outputDir);

  return (
    <div className="min-h-screen bg-[#0e0e10] text-zinc-100 flex flex-col font-sans">
      <Header
        status={status}
        onReset={handleReset}
        onOpenOutput={handleOpenFolder}
        hasOutput={Boolean(config.outputDir && status === 'completed')}
      />

      <main className="flex-1 p-5 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Asset Inputs & Pacing Controls (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <AssetInputPanel
            config={config}
            onChange={setConfig}
            onPickVoice={handlePickVoice}
            onPickScript={handlePickScript}
            onPickOutputDir={handlePickOutputDir}
            onPickImagesDir={handlePickImagesDir}
            disabled={status === 'processing'}
          />

          <PacingControls
            settings={settings}
            onChange={setSettings}
            disabled={status === 'processing'}
          />
        </div>

        {/* Right Column: Timeline Alignment Matrix & Export Panel (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <TimelineVisualizer
            segments={segments}
            onToggleAssetType={handleToggleAssetType}
            disabled={status === 'processing'}
          />

          <ExportPanel
            onProcessAndExport={handleProcessAndExport}
            onOpenFolder={handleOpenFolder}
            isProcessing={status === 'processing'}
            canProcess={canProcess}
            logs={logs}
            status={status}
          />
        </div>
      </main>
    </div>
  );
};

export default App;
