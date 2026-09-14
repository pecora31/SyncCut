import React, { useState } from 'react';
import { ProjectConfig, InterleavingSettings, SentenceSegment } from '../types';

interface ProjectBinProps {
  config: ProjectConfig;
  settings: InterleavingSettings;
  segments: SentenceSegment[];
  currentPlaybackTime: number;
  onConfigChange: (config: ProjectConfig) => void;
  onSettingsChange: (settings: InterleavingSettings) => void;
  onPickVoice: () => void;
  onPickScript: () => void;
  onPickOutputDir: () => void;
  onPickImagesDir: () => void;
  onSelectSegmentTime: (time: number) => void;
  onOpenYouTubeDownloader: () => void;
  disabled: boolean;
}

export const ProjectBin: React.FC<ProjectBinProps> = ({
  config,
  settings,
  segments,
  currentPlaybackTime,
  onConfigChange,
  onSettingsChange,
  onPickVoice,
  onPickScript,
  onPickOutputDir,
  onPickImagesDir,
  onSelectSegmentTime,
  onOpenYouTubeDownloader,
  disabled,
}) => {
  const [activeTab, setActiveTab] = useState<'assets' | 'settings' | 'script'>('assets');
  const [urlInput, setUrlInput] = useState('');

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const urls = trimmed.split(/[\r\n\s]+/).filter((u) => u.startsWith('http://') || u.startsWith('https://'));
    const combined = Array.from(new Set([...config.youtubeUrls, ...(urls.length ? urls : [trimmed])]));
    onConfigChange({
      ...config,
      youtubeUrls: combined,
    });
    setUrlInput('');
  };

  const handleRemoveUrl = (index: number) => {
    const updated = config.youtubeUrls.filter((_, i) => i !== index);
    onConfigChange({
      ...config,
      youtubeUrls: updated,
    });
  };

  const getFileName = (path: string) => {
    if (!path) return '';
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  };

  return (
    <div className="flex flex-col h-full bg-[#232323] border border-[#333333] select-none text-xs rounded-sm overflow-hidden">
      {/* Tab Navigation */}
      <div className="h-8 bg-[#2b2b2b] border-b border-[#383838] px-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('assets')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'assets'
                ? 'text-white border-b-2 border-white bg-[#232323]'
                : 'text-[#888888] hover:text-[#e0e0e0]'
            }`}
          >
            Assets ({config.voicePath ? 'Ready' : 'Empty'})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-white border-b-2 border-white bg-[#232323]'
                : 'text-[#888888] hover:text-[#e0e0e0]'
            }`}
          >
            Pacing
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('script')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'script'
                ? 'text-white border-b-2 border-white bg-[#232323]'
                : 'text-[#888888] hover:text-[#e0e0e0]'
            }`}
          >
            Script ({segments.length})
          </button>
        </div>

        <span className="text-[10px] text-[#606060] font-mono pr-1">PROJECT BIN</span>
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-2.5 overflow-y-auto bg-[#1e1e1e]">
        {/* TAB 1: ASSETS */}
        {activeTab === 'assets' && (
          <div className="flex flex-col gap-2">
            {/* 1. Voice File */}
            <div className="flex items-center justify-between p-2 bg-[#262626] border border-[#333333] rounded">
              <div className="flex items-center gap-2 truncate flex-1">
                <div className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444] text-[#e6e6e6] font-mono font-bold text-[10px]">
                  A1
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-[11px] font-medium text-[#e6e6e6] truncate">
                    {config.voicePath ? getFileName(config.voicePath) : 'Select voice track (.mp4 / .wav)'}
                  </span>
                  <span className="text-[9px] text-[#707070] font-mono">Master audio</span>
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={onPickVoice}
                className="px-2.5 py-1 bg-[#333333] hover:bg-[#3d3d3d] text-[11px] text-[#cccccc] hover:text-white rounded border border-[#404040]"
              >
                {config.voicePath ? 'Change' : 'Browse'}
              </button>
            </div>

            {/* 2. Script TXT */}
            <div className="flex items-center justify-between p-2 bg-[#262626] border border-[#333333] rounded">
              <div className="flex items-center gap-2 truncate flex-1">
                <div className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444] text-[#e6e6e6] font-mono font-bold text-[10px]">
                  TXT
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-[11px] font-medium text-[#e6e6e6] truncate">
                    {config.scriptPath ? getFileName(config.scriptPath) : 'Select script text (.txt)'}
                  </span>
                  <span className="text-[9px] text-[#707070] font-mono">Script ground truth</span>
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={onPickScript}
                className="px-2.5 py-1 bg-[#333333] hover:bg-[#3d3d3d] text-[11px] text-[#cccccc] hover:text-white rounded border border-[#404040]"
              >
                {config.scriptPath ? 'Change' : 'Browse'}
              </button>
            </div>

            {/* 3. Output Folder */}
            <div className="flex items-center justify-between p-2 bg-[#262626] border border-[#333333] rounded">
              <div className="flex items-center gap-2 truncate flex-1">
                <div className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444] text-[#e6e6e6] font-mono font-bold text-[10px]">
                  DIR
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-[11px] font-medium text-[#e6e6e6] truncate">
                    {config.outputDir ? getFileName(config.outputDir) : 'Select output folder'}
                  </span>
                  <span className="text-[9px] text-[#707070] font-mono">Premiere XML destination</span>
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={onPickOutputDir}
                className="px-2.5 py-1 bg-[#333333] hover:bg-[#3d3d3d] text-[11px] text-[#cccccc] hover:text-white rounded border border-[#404040]"
              >
                {config.outputDir ? 'Change' : 'Browse'}
              </button>
            </div>

            {/* 4. YouTube B-Roll Queue */}
            <div className="flex flex-col gap-1.5 p-2 bg-[#232323] border border-[#303030] rounded">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#e0e0e0] font-medium">
                  YouTube B-Roll ({config.youtubeUrls.length})
                </span>

                <button
                  type="button"
                  disabled={disabled}
                  onClick={onOpenYouTubeDownloader}
                  className="px-2 py-0.5 bg-[#2a2a2a] hover:bg-[#353535] border border-[#444444] text-[#cccccc] hover:text-white rounded text-[10px] font-medium transition-colors"
                >
                  Downloader...
                </button>
              </div>

              <div className="flex gap-1">
                <input
                  type="text"
                  disabled={disabled}
                  placeholder="YouTube URL (https://...)"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                  className="flex-1 px-2 py-1 bg-[#1a1a1a] border border-[#383838] focus:border-[#666666] rounded text-[#e6e6e6] text-[11px] outline-none"
                />
                <button
                  type="button"
                  disabled={disabled || !urlInput.trim()}
                  onClick={handleAddUrl}
                  className="px-2.5 py-1 bg-[#2d2d2d] hover:bg-[#383838] border border-[#404040] text-[#cccccc] rounded text-[10px]"
                >
                  Add
                </button>
              </div>

              {config.youtubeUrls.length > 0 && (
                <div className="flex flex-col gap-1 max-h-20 overflow-y-auto mt-0.5">
                  {config.youtubeUrls.map((url, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-2 py-0.5 bg-[#1a1a1a] border border-[#2b2b2b] rounded text-[10px] font-mono text-[#b0b0b0]"
                    >
                      <span className="truncate max-w-[210px]">{url}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveUrl(i)}
                        className="text-[#707070] hover:text-white px-1"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5. Custom Images Folder */}
            <div className="flex items-center justify-between pt-1 border-t border-[#2b2b2b] text-[11px]">
              <span className="text-[#808080]">
                Additional Images Folder
              </span>
              <button
                type="button"
                onClick={onPickImagesDir}
                className="px-2 py-0.5 bg-[#2d2d2d] hover:bg-[#383838] border border-[#383838] text-[10px] font-mono text-[#b0b0b0] rounded"
              >
                {config.imagesDir ? getFileName(config.imagesDir) : 'Browse'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: PACING (SETTINGS) */}
        {activeTab === 'settings' && (
          <div className="flex flex-col gap-3">
            {/* Video vs Image Ratio */}
            <div className="flex flex-col gap-1.5 p-2 bg-[#242424] border border-[#303030] rounded">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#e6e6e6]">
                  Video: {settings.videoRatio}%
                </span>
                <span className="text-[#a0a0a0]">
                  Images: {100 - settings.videoRatio}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={settings.videoRatio}
                onChange={(e) => onSettingsChange({ ...settings, videoRatio: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 bg-[#141414] rounded appearance-none cursor-pointer accent-[#888888]"
              />
            </div>

            {/* Interleaving Mode */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#909090]">Interleaving Pattern</label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'ratio', label: 'Ratio' },
                  { id: 'alternate', label: 'Alternate' },
                  { id: 'random', label: 'Random' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onSettingsChange({ ...settings, pattern: mode.id as any })}
                    className={`py-1 text-[11px] rounded border text-center transition-all ${
                      settings.pattern === mode.id
                        ? 'bg-[#333333] border-[#666666] text-white font-medium'
                        : 'bg-[#242424] border-[#383838] text-[#808080] hover:text-[#cccccc]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scene duration & FPS */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#2b2b2b]">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#808080]">Scene Duration (s)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={settings.minSceneDuration}
                    onChange={(e) => onSettingsChange({ ...settings, minSceneDuration: parseFloat(e.target.value) || 2.5 })}
                    className="w-12 px-1 py-0.5 bg-[#1a1a1a] border border-[#383838] rounded text-center text-xs font-mono text-[#e6e6e6]"
                  />
                  <span className="text-[#666666]">-</span>
                  <input
                    type="number"
                    min="2"
                    max="15"
                    step="0.5"
                    value={settings.maxSceneDuration}
                    onChange={(e) => onSettingsChange({ ...settings, maxSceneDuration: parseFloat(e.target.value) || 6.0 })}
                    className="w-12 px-1 py-0.5 bg-[#1a1a1a] border border-[#383838] rounded text-center text-xs font-mono text-[#e6e6e6]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#808080]">Frame Rate (FPS)</label>
                <select
                  value={settings.fps}
                  onChange={(e) => onSettingsChange({ ...settings, fps: parseFloat(e.target.value) })}
                  className="px-1.5 py-0.5 bg-[#1a1a1a] border border-[#383838] rounded text-xs font-mono text-[#e6e6e6]"
                >
                  <option value="24">24 fps</option>
                  <option value="25">25 fps</option>
                  <option value="30">30 fps</option>
                  <option value="60">60 fps</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SCRIPT */}
        {activeTab === 'script' && (
          <div className="flex flex-col gap-1.5">
            {segments.length === 0 ? (
              <div className="text-center py-8 text-[#666666] text-xs">
                No scenes yet. Click "Export XML" to align script and generate timeline.
              </div>
            ) : (
              segments.map((seg) => {
                const isActive = currentPlaybackTime >= seg.startTime && currentPlaybackTime <= seg.endTime;
                return (
                  <div
                    key={seg.id}
                    onClick={() => onSelectSegmentTime(seg.startTime)}
                    className={`p-2 rounded border cursor-pointer transition-colors text-xs ${
                      isActive
                        ? 'bg-[#303030] border-[#666666] text-white'
                        : 'bg-[#262626] border-[#303030] text-[#999999] hover:text-[#cccccc]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                      <span className="text-[#707070]">Scene #{seg.id} ({seg.duration.toFixed(1)}s)</span>
                      <span className="text-[#cccccc] font-medium">
                        [{seg.assetType === 'video' ? 'VIDEO' : 'IMAGE'}]
                      </span>
                    </div>
                    <p className="line-clamp-2 leading-relaxed">{seg.text}</p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
