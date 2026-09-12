import React, { useState } from 'react';
import { Folder, Mic, FileText, Video, Image, Sliders, ListOrdered, Plus, Trash2, CheckCircle2, Film, Clock, Gauge } from 'lucide-react';
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
  disabled,
}) => {
  const [activeTab, setActiveTab] = useState<'assets' | 'settings' | 'inspector'>('assets');
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
    <div className="flex flex-col h-full bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden select-none">
      {/* Premiere Bin Tab Bar */}
      <div className="flex items-center justify-between border-b border-[#30363d] bg-[#0d1117] px-2 pt-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('assets')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t border-t border-x transition-colors ${
              activeTab === 'assets'
                ? 'bg-[#161b22] border-[#30363d] text-[#f0f6fc] border-b-transparent'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]/50'
            }`}
          >
            <Folder className="w-3.5 h-3.5 text-[#58a6ff]" />
            Project Assets
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t border-t border-x transition-colors ${
              activeTab === 'settings'
                ? 'bg-[#161b22] border-[#30363d] text-[#f0f6fc] border-b-transparent'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]/50'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-[#e3b341]" />
            Pacing & Ratio
          </button>

          <button
            onClick={() => setActiveTab('inspector')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t border-t border-x transition-colors ${
              activeTab === 'inspector'
                ? 'bg-[#161b22] border-[#30363d] text-[#f0f6fc] border-b-transparent'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]/50'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5 text-[#3fb950]" />
            Script ({segments.length})
          </button>
        </div>

        <span className="text-[10px] font-mono text-[#6e7681] pr-2">BIN / SOURCES</span>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 p-3 overflow-y-auto">
        {/* TAB 1: ASSETS */}
        {activeTab === 'assets' && (
          <div className="flex flex-col gap-3 text-xs">
            {/* Voice File Picker */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-[#8b949e] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-[#58a6ff]" />
                  Voiceover Track (MP4/WAV)
                </span>
                {config.voicePath && (
                  <span className="text-[10px] text-[#3fb950] flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Linked
                  </span>
                )}
              </label>
              <button
                type="button"
                disabled={disabled}
                onClick={onPickVoice}
                className="px-2.5 py-1.5 bg-[#0d1117] hover:bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded text-left truncate font-mono transition-colors"
              >
                {config.voicePath ? getFileName(config.voicePath) : 'Click to link Voiceover MP4/WAV...'}
              </button>
            </div>

            {/* Script File Picker */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-[#8b949e] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#58a6ff]" />
                  Script Text (.TXT)
                </span>
                {config.scriptPath && (
                  <span className="text-[10px] text-[#3fb950] flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Linked
                  </span>
                )}
              </label>
              <button
                type="button"
                disabled={disabled}
                onClick={onPickScript}
                className="px-2.5 py-1.5 bg-[#0d1117] hover:bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded text-left truncate font-mono transition-colors"
              >
                {config.scriptPath ? getFileName(config.scriptPath) : 'Click to link Script .txt...'}
              </button>
            </div>

            {/* Output Destination Folder */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-[#8b949e] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-[#58a6ff]" />
                  Output Destination (XML Project)
                </span>
                {config.outputDir && (
                  <span className="text-[10px] text-[#3fb950] flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Set
                  </span>
                )}
              </label>
              <button
                type="button"
                disabled={disabled}
                onClick={onPickOutputDir}
                className="px-2.5 py-1.5 bg-[#0d1117] hover:bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded text-left truncate font-mono transition-colors"
              >
                {config.outputDir || 'Click to select project output folder...'}
              </button>
            </div>

            {/* YouTube B-Roll Sources */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[#21262d]">
              <label className="text-[11px] font-mono text-[#8b949e] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-[#f85149]" />
                  YouTube B-Roll Queue
                </span>
                <span className="text-[10px] text-[#6e7681] font-mono">{config.youtubeUrls.length} source(s)</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  disabled={disabled}
                  placeholder="Paste YouTube link (https://...)"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                  onBlur={handleAddUrl}
                  className="flex-1 px-2.5 py-1 text-xs bg-[#0d1117] border border-[#30363d] focus:border-[#58a6ff] rounded text-[#f0f6fc] placeholder-[#6e7681] outline-none"
                />
                <button
                  type="button"
                  disabled={disabled || !urlInput.trim()}
                  onClick={handleAddUrl}
                  className="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] rounded flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>

              {config.youtubeUrls.length > 0 && (
                <div className="flex flex-col gap-1 max-h-24 overflow-y-auto mt-0.5">
                  {config.youtubeUrls.map((url, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between px-2 py-1 bg-[#0d1117] border border-[#21262d] rounded text-[10px] font-mono text-[#c9d1d9]"
                    >
                      <span className="truncate max-w-[220px]">{url}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveUrl(index)}
                        className="text-[#6e7681] hover:text-[#f85149]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Images Folder */}
            <div className="flex items-center justify-between pt-2 border-t border-[#21262d]">
              <span className="text-[11px] font-mono text-[#8b949e] flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5 text-[#8b949e]" />
                Image Folder (Optional)
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={onPickImagesDir}
                className="px-2 py-0.5 text-[10px] font-mono bg-[#0d1117] hover:bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded"
              >
                {config.imagesDir ? getFileName(config.imagesDir) : 'Select...'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: PACING & INTERLEAVING */}
        {activeTab === 'settings' && (
          <div className="flex flex-col gap-3 text-xs">
            {/* Ratio Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#58a6ff] flex items-center gap-1">
                  <Film className="w-3.5 h-3.5" /> Video: {settings.videoRatio}%
                </span>
                <span className="text-[#3fb950] flex items-center gap-1">
                  <Image className="w-3.5 h-3.5" /> Image: {100 - settings.videoRatio}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                disabled={disabled}
                value={settings.videoRatio}
                onChange={(e) => onSettingsChange({ ...settings, videoRatio: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 bg-[#0d1117] rounded appearance-none cursor-pointer accent-[#58a6ff]"
              />
            </div>

            {/* Pattern */}
            <div className="flex flex-col gap-1 pt-2 border-t border-[#21262d]">
              <label className="text-[11px] font-mono text-[#8b949e]">Interleaving Rhythm</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'ratio', label: 'Ratio-based' },
                  { id: 'alternate', label: '1 Video - 1 Img' },
                  { id: 'random', label: 'Random' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onSettingsChange({ ...settings, pattern: mode.id as any })}
                    className={`py-1 px-1.5 text-[10px] font-mono rounded border text-center transition-all ${
                      settings.pattern === mode.id
                        ? 'bg-[#1f242c] border-[#58a6ff] text-[#f0f6fc]'
                        : 'bg-[#0d1117] border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scene Duration & Sequence FPS */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#21262d]">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-[#8b949e] flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Scene Dur (s)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={settings.minSceneDuration}
                    onChange={(e) => onSettingsChange({ ...settings, minSceneDuration: parseFloat(e.target.value) || 2.5 })}
                    className="w-12 px-1.5 py-0.5 bg-[#0d1117] border border-[#30363d] rounded text-center text-xs font-mono text-[#c9d1d9]"
                  />
                  <span className="text-[10px] text-[#6e7681]">-</span>
                  <input
                    type="number"
                    min="2"
                    max="15"
                    step="0.5"
                    value={settings.maxSceneDuration}
                    onChange={(e) => onSettingsChange({ ...settings, maxSceneDuration: parseFloat(e.target.value) || 6.0 })}
                    className="w-12 px-1.5 py-0.5 bg-[#0d1117] border border-[#30363d] rounded text-center text-xs font-mono text-[#c9d1d9]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-[#8b949e] flex items-center gap-1">
                  <Gauge className="w-3 h-3" /> Timeline FPS
                </label>
                <select
                  value={settings.fps}
                  onChange={(e) => onSettingsChange({ ...settings, fps: parseFloat(e.target.value) })}
                  className="px-1.5 py-0.5 bg-[#0d1117] border border-[#30363d] rounded text-xs font-mono text-[#c9d1d9]"
                >
                  <option value="23.976">23.976 fps</option>
                  <option value="24">24 fps</option>
                  <option value="25">25 fps</option>
                  <option value="29.97">29.97 fps</option>
                  <option value="30">30 fps</option>
                  <option value="60">60 fps</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SCRIPT INSPECTOR */}
        {activeTab === 'inspector' && (
          <div className="flex flex-col gap-1.5">
            {segments.length === 0 ? (
              <div className="text-center py-8 text-[#6e7681] text-xs">
                No scenes aligned yet. Click "Export Premiere XML" to generate scene segments.
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
                        ? 'bg-[#1f242c] border-[#58a6ff] text-[#f0f6fc]'
                        : 'bg-[#0d1117] border-[#21262d] text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#6e7681] mb-1">
                      <span>#{seg.id} ({seg.duration.toFixed(2)}s)</span>
                      <span className={seg.assetType === 'video' ? 'text-[#58a6ff]' : 'text-[#3fb950]'}>
                        [{seg.assetType.toUpperCase()}]
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
