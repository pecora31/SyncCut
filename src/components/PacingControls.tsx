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
    <div className="flex flex-col gap-4 p-4 bg-[#141418] border border-[#24242c] rounded-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#22222a]">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
          2. Interleaving & Pacing Settings
        </span>
      </div>

      {/* Video vs Image Ratio Slider */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-indigo-400" />
            Video B-Roll: <strong className="text-indigo-300">{settings.videoRatio}%</strong>
          </span>
          <span className="text-zinc-400 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
            Static Images: <strong className="text-emerald-300">{100 - settings.videoRatio}%</strong>
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
          className="w-full h-1.5 bg-[#252532] rounded appearance-none cursor-pointer accent-indigo-500 disabled:opacity-50"
        />

        <div className="flex justify-between text-[10px] font-mono text-zinc-500">
          <span>0% (All Images)</span>
          <span>50% (Balanced)</span>
          <span>100% (All Video)</span>
        </div>
      </div>

      {/* Pattern Selector */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-[#202028]">
        <label className="text-[11px] font-mono text-zinc-400">Interleaving Pattern</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'ratio', label: 'Weighted Ratio', desc: 'Theo tỉ lệ %' },
            { id: 'alternate', label: 'Strict Alternate', desc: '1 Video - 1 Ảnh' },
            { id: 'random', label: 'Random Mix', desc: 'Ngẫu nhiên' },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...settings, pattern: mode.id as any })}
              className={`px-2.5 py-2 rounded text-left border transition-all ${
                settings.pattern === mode.id
                  ? 'bg-[#1e1e2c] border-indigo-500/70 text-zinc-100'
                  : 'bg-[#171720] border-[#292936] text-zinc-400 hover:text-zinc-300 hover:border-[#39394a]'
              } disabled:opacity-50`}
            >
              <div className="text-[11px] font-mono font-medium">{mode.label}</div>
              <div className="text-[9px] text-zinc-500 mt-0.5">{mode.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Scene Timing & Sequence FPS */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#202028]">
        {/* Min/Max Scene Duration */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
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
              className="w-16 px-2 py-1 text-xs font-mono bg-[#181820] border border-[#2c2c38] rounded text-zinc-200 outline-none focus:border-indigo-500 text-center"
            />
            <span className="text-xs text-zinc-500 font-mono">to</span>
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
              className="w-16 px-2 py-1 text-xs font-mono bg-[#181820] border border-[#2c2c38] rounded text-zinc-200 outline-none focus:border-indigo-500 text-center"
            />
          </div>
        </div>

        {/* Target FPS */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-zinc-400" />
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
            className="px-2 py-1 text-xs font-mono bg-[#181820] border border-[#2c2c38] rounded text-zinc-200 outline-none focus:border-indigo-500"
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
