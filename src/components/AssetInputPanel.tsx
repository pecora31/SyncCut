import React, { useState } from 'react';
import { Video, Mic, FileText, Folder, Image, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { ProjectConfig } from '../types';

interface AssetInputPanelProps {
  config: ProjectConfig;
  onChange: (config: ProjectConfig) => void;
  onPickVoice: () => void;
  onPickScript: () => void;
  onPickOutputDir: () => void;
  onPickImagesDir: () => void;
  disabled: boolean;
}

export const AssetInputPanel: React.FC<AssetInputPanelProps> = ({
  config,
  onChange,
  onPickVoice,
  onPickScript,
  onPickOutputDir,
  onPickImagesDir,
  disabled,
}) => {
  const [urlInput, setUrlInput] = useState('');

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    
    // Support pasting multiple URLs separated by newline or space
    const urls = trimmed.split(/[\r\n\s]+/).filter((u) => u.startsWith('http://') || u.startsWith('https://'));
    const combined = Array.from(new Set([...config.youtubeUrls, ...(urls.length ? urls : [trimmed])]));
    
    onChange({
      ...config,
      youtubeUrls: combined,
    });
    setUrlInput('');
  };

  const handleRemoveUrl = (index: number) => {
    const updated = config.youtubeUrls.filter((_, i) => i !== index);
    onChange({
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
    <div className="flex flex-col gap-4 p-4 bg-[#161b22] border border-[#30363d] rounded-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#21262d]">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#c9d1d9] flex items-center gap-2">
          <Folder className="w-3.5 h-3.5 text-[#58a6ff]" />
          1. Project Assets & Sources
        </span>
      </div>

      {/* Voice & Script Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Voice MP4 Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono text-[#8b949e] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-[#58a6ff]" />
              Voiceover File (MP4/WAV)
            </span>
            {config.voicePath && (
              <span className="text-[10px] text-[#3fb950] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Selected
              </span>
            )}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={onPickVoice}
              className="px-3 py-2 text-xs font-mono bg-[#0d1117] hover:bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded-md flex-1 text-left truncate transition-colors disabled:opacity-50"
            >
              {config.voicePath ? getFileName(config.voicePath) : 'Click to select voice MP4/WAV...'}
            </button>
          </div>
        </div>

        {/* Script TXT Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono text-[#8b949e] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#58a6ff]" />
              Script Text File (.TXT)
            </span>
            {config.scriptPath && (
              <span className="text-[10px] text-[#3fb950] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Selected
              </span>
            )}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={onPickScript}
              className="px-3 py-2 text-xs font-mono bg-[#0d1117] hover:bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded-md flex-1 text-left truncate transition-colors disabled:opacity-50"
            >
              {config.scriptPath ? getFileName(config.scriptPath) : 'Click to select script .txt...'}
            </button>
          </div>
        </div>
      </div>

      {/* Output Workspace Directory */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-mono text-[#8b949e] flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-[#58a6ff]" />
            Output Workspace (Destination Folder)
          </span>
          {config.outputDir && (
            <span className="text-[10px] text-[#3fb950] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Set
            </span>
          )}
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={onPickOutputDir}
          className="px-3 py-2 text-xs font-mono bg-[#0d1117] hover:bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded-md text-left truncate transition-colors disabled:opacity-50"
        >
          {config.outputDir || 'Click to choose output directory for Premiere XML...'}
        </button>
      </div>

      {/* YouTube B-Roll Sources */}
      <div className="flex flex-col gap-2 pt-2 border-t border-[#21262d]">
        <label className="text-[11px] font-mono text-[#8b949e] flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-[#f85149]" />
            YouTube Source Videos (B-Roll Sample Footage)
          </span>
          <span className="text-[10px] text-[#6e7681] font-mono">
            {config.youtubeUrls.length} video(s) added
          </span>
        </label>

        <div className="flex gap-2">
          <input
            type="text"
            disabled={disabled}
            placeholder="Paste YouTube video URL (e.g. https://www.youtube.com/watch?v=...)"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            className="flex-1 px-3 py-1.5 text-xs bg-[#0d1117] border border-[#30363d] focus:border-[#58a6ff] rounded-md text-[#f0f6fc] placeholder-[#6e7681] outline-none transition-colors disabled:opacity-50"
          />
          <button
            type="button"
            disabled={disabled || !urlInput.trim()}
            onClick={handleAddUrl}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] rounded-md transition-colors disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {config.youtubeUrls.length > 0 && (
          <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto mt-1 pr-1">
            {config.youtubeUrls.map((url, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-2.5 py-1.5 bg-[#0d1117] border border-[#21262d] rounded-md text-[11px] text-[#c9d1d9] font-mono"
              >
                <span className="truncate max-w-[420px]">{url}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRemoveUrl(index)}
                  className="p-1 text-[#6e7681] hover:text-[#f85149] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Optional Custom Images Directory */}
      <div className="flex items-center justify-between pt-2 border-t border-[#21262d]">
        <div className="flex items-center gap-2">
          <Image className="w-3.5 h-3.5 text-[#8b949e]" />
          <span className="text-[11px] font-mono text-[#8b949e]">Custom Images Folder (Optional)</span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onPickImagesDir}
          className="px-2.5 py-1 text-[11px] font-mono bg-[#0d1117] hover:bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded-md transition-colors disabled:opacity-50"
        >
          {config.imagesDir ? getFileName(config.imagesDir) : 'Select folder...'}
        </button>
      </div>
    </div>
  );
};
