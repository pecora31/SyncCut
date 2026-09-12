import React from 'react';
import { Sliders, Film, Image as ImageIcon, Clock, Gauge } from 'lucide-react';
import { InterleavingSettings } from '../types';

interface PacingControlsProps {
  settings: InterleavingSettings;
  onChange: (settings: InterleavingSettings) => void;
  disabled: boolean;
}

export const PacingControls: React.FC<PacingControlsProps> = ({ settings, onChange, disabled }) => {
  return (
    <div className="flex flex-col gap-4 p-4 bg-[#161b22] border border-[#30363d] rounded-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#21262d]">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#c9d1d9] flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-[#58a6ff]" />
          2. Interleaving & Pacing Settings
        </span>
      </div>

      {/* Video vs Image Ratio Slider */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-[#8b949e] flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-[#58a6ff]" />
            Video B-Roll: <strong className="text-[#58a6ff]">{settings.videoRatio}%</strong>
          </span>
          <span className="text-[#8b949e] flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-[#3fb950]" />
            Static Images: <strong className="text-[#3fb950]">{100 - settings.videoRatio}%</strong>
          </span>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="5"
          disabled={disabled}
          value={settings.videoRatio}
          onChange={(e) =>
            onChange({
              ...settings,
              videoRatio: parseInt(e.target.value, 10),
            })
          }
          className="w-full h-1.5 bg-[#21262d] rounded appearance-none cursor-pointer accent-[#58a6ff] disabled:opacity-50"
        />

        <div className="flex justify-between text-[10px] font-mono text-[#6e7681]">
          <span>0% (All Images)</span>
          <span>50% (Balanced)</span>
          <span>100% (All Video)</span>
        </div>
      </div>

      {/* Pattern Selector */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-[#21262d]">
        <label className="text-[11px] font-mono text-[#8b949e]">Interleaving Pattern</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'ratio', label: 'Weighted Ratio', desc: 'Ratio-based' },
            { id: 'alternate', label: 'Strict Alternate', desc: '1 Video - 1 Image' },
            { id: 'random', label: 'Random Mix', desc: 'Randomized' },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...settings, pattern: mode.id as any })}
              className={`px-2.5 py-2 rounded-md text-left border transition-all ${
                settings.pattern === mode.id
                  ? 'bg-[#1f242c] border-[#58a6ff] text-[#f0f6fc]'
                  : 'bg-[#0d1117] border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#484f58]'
              } disabled:opacity-50`}
            >
              <div className="text-[11px] font-mono font-medium">{mode.label}</div>
              <div className="text-[9px] text-[#6e7681] mt-0.5">{mode.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Scene Timing & Sequence FPS */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#21262d]">
        {/* Min/Max Scene Duration */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono text-[#8b949e] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#8b949e]" />
            Scene Duration (Min/Max s)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="10"
              step="0.5"
              disabled={disabled}
              value={settings.minSceneDuration}
              onChange={(e) =>
                onChange({
                  ...settings,
                  minSceneDuration: parseFloat(e.target.value) || 2.5,
                })
              }
              className="w-16 px-2 py-1 text-xs font-mono bg-[#0d1117] border border-[#30363d] rounded-md text-[#c9d1d9] outline-none focus:border-[#58a6ff] text-center"
            />
            <span className="text-xs text-[#6e7681] font-mono">to</span>
            <input
              type="number"
              min="2"
              max="15"
              step="0.5"
              disabled={disabled}
              value={settings.maxSceneDuration}
              onChange={(e) =>
                onChange({
                  ...settings,
                  maxSceneDuration: parseFloat(e.target.value) || 6.0,
                })
              }
              className="w-16 px-2 py-1 text-xs font-mono bg-[#0d1117] border border-[#30363d] rounded-md text-[#c9d1d9] outline-none focus:border-[#58a6ff] text-center"
            />
          </div>
        </div>

        {/* Target FPS */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono text-[#8b949e] flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-[#8b949e]" />
            Premiere Sequence FPS
          </label>
          <select
            disabled={disabled}
            value={settings.fps}
            onChange={(e) =>
              onChange({
                ...settings,
                fps: parseFloat(e.target.value),
              })
            }
            className="px-2 py-1 text-xs font-mono bg-[#0d1117] border border-[#30363d] rounded-md text-[#c9d1d9] outline-none focus:border-[#58a6ff]"
          >
            <option value="23.976">23.976 fps (Film)</option>
            <option value="24">24 fps (Cinema)</option>
            <option value="25">25 fps (PAL)</option>
            <option value="29.97">29.97 fps (NTSC)</option>
            <option value="30">30 fps (Standard)</option>
            <option value="60">60 fps (Smooth)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
