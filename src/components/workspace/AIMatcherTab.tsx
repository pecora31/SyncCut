import React, { useState, useEffect } from 'react';
import { SentenceSegment, MediaAsset } from '../../types';
import { useLanguage } from '../../i18n';

interface AIMatcherTabProps {
  activeVoicePath: string;
  activeScriptPath: string;
  brollAssets: MediaAsset[];
  segments: SentenceSegment[];
  outputDir: string;
  onSegmentsMatched?: (segments: SentenceSegment[]) => void;
  onSelectSegment: (segment: SentenceSegment) => void;
  onNavigateToMediaPool?: () => void;
}

interface AIMatcherConfig {
  // Simple / Creator-friendly settings
  profile: 'draft' | 'balanced' | 'quality' | 'custom';
  pacingDuration: number;
  formatTarget: '1080p' | '9:16' | '4k';
  language: string;
  coverage: 'fill-all' | 'strict';

  // Advanced settings
  whisperModel: string;
  visualModel: string;
  alignmentMode: string;
  vadFilter: boolean;
  minShotDuration: string;
  confidenceThreshold: string;
  framerate: string;
  xmlFormat: string;
}

const DEFAULT_CONFIG: AIMatcherConfig = {
  profile: 'balanced',
  pacingDuration: 4.5,
  formatTarget: '1080p',
  language: 'auto',
  coverage: 'fill-all',

  whisperModel: 'small',
  visualModel: 'clip-vit-b32',
  alignmentMode: 'forced',
  vadFilter: true,
  minShotDuration: '3.0',
  confidenceThreshold: '80',
  framerate: '30',
  xmlFormat: 'fcp7xml',
};

const STORAGE_KEY = 'synccut_ai_matcher_config';

function secondsToTimeString(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}


export const AIMatcherTab: React.FC<AIMatcherTabProps> = ({
  activeVoicePath,
  activeScriptPath,
  brollAssets,
  segments,
  onSelectSegment,
}) => {
  const { t } = useLanguage();
  const [activeSubTab, setActiveSubTab] = useState<'settings' | 'scenes'>('settings');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideTab, setGuideTab] = useState<'general' | 'advanced'>('general');

  const [config, setConfig] = useState<AIMatcherConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch {
      // fallback
    }
    return DEFAULT_CONFIG;
  });

  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSavedNotice(true);
      const timer = setTimeout(() => setSavedNotice(false), 1200);
      return () => clearTimeout(timer);
    } catch {
      // ignore
    }
  }, [config]);

  const handleProfileChange = (profile: 'draft' | 'balanced' | 'quality') => {
    if (profile === 'draft') {
      setConfig((prev) => ({
        ...prev,
        profile: 'draft',
        whisperModel: 'base',
        visualModel: 'clip-vit-b32',
      }));
    } else if (profile === 'balanced') {
      setConfig((prev) => ({
        ...prev,
        profile: 'balanced',
        whisperModel: 'small',
        visualModel: 'clip-vit-b32',
      }));
    } else if (profile === 'quality') {
      setConfig((prev) => ({
        ...prev,
        profile: 'quality',
        whisperModel: 'medium',
        visualModel: 'clip-vit-l14',
      }));
    }
  };

  const handlePacingSliderChange = (dur: number) => {
    const minShot = Math.max(1.5, Math.min(dur * 0.7, 6.0)).toFixed(1);
    setConfig((prev) => ({
      ...prev,
      pacingDuration: dur,
      minShotDuration: minShot,
    }));
  };

  const updateAdvancedField = <K extends keyof AIMatcherConfig>(field: K, value: AIMatcherConfig[K]) => {
    setConfig((prev) => ({
      ...prev,
      profile: 'custom',
      [field]: value,
    }));
  };

  const handleResetDefaults = () => {
    setConfig(DEFAULT_CONFIG);
  };

  const voiceName = activeVoicePath ? activeVoicePath.split(/[/\\]/).pop() : t.none;
  const scriptName = activeScriptPath ? activeScriptPath.split(/[/\\]/).pop() : t.none;

  return (
    <div className="flex flex-col h-full overflow-hidden select-none text-xs text-[#cccccc]">
      {/* 1. Header Navigation Bar */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#2c2c2c] shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('settings')}
            className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors focus:outline-none ${
              activeSubTab === 'settings'
                ? 'bg-[#2a2a2a] text-white'
                : 'text-[#888888] hover:text-[#cccccc]'
            }`}
          >
            {t.aiSettings}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('scenes')}
            className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors focus:outline-none ${
              activeSubTab === 'scenes'
                ? 'bg-[#2a2a2a] text-white'
                : 'text-[#888888] hover:text-[#cccccc]'
            }`}
          >
            {t.matchedScenes} ({segments.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {savedNotice && (
            <span className="text-[11px] text-[#888888] font-mono">
              {t.autoSaved}
            </span>
          )}

          {activeSubTab === 'settings' && (
            <>
              <button
                type="button"
                onClick={() => setShowGuide((prev) => !prev)}
                className={`px-2.5 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                  showGuide
                    ? 'bg-[#303030] text-white border-[#555555]'
                    : 'text-[#888888] hover:text-white bg-[#1a1a1a] hover:bg-[#252525] border-[#333333]'
                }`}
              >
                {showGuide ? t.hideGuide : t.settingsGuide}
              </button>

              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-2.5 py-1 text-[11px] font-mono text-[#888888] hover:text-white bg-[#1a1a1a] hover:bg-[#252525] border border-[#333333] rounded transition-colors cursor-pointer"
              >
                {t.resetDefaults}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Main Body Content */}
      {activeSubTab === 'settings' ? (
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
          {/* Quick Guide Panel (Collapsible) */}
          {showGuide && (
            <div className="p-3 bg-[#181818] border border-[#3a3a3a] rounded flex flex-col gap-2.5 text-xs text-[#cccccc]">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#282828]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white text-xs">
                    {t.guideTitle}
                  </span>
                  <div className="flex items-center bg-[#101010] border border-[#2c2c2c] rounded p-0.5 select-none">
                    <button
                      type="button"
                      onClick={() => setGuideTab('general')}
                      className={`px-2 py-0.5 rounded-xs text-[10px] font-mono transition-colors cursor-pointer ${
                        guideTab === 'general' ? 'bg-[#282828] text-white font-semibold' : 'text-[#777777] hover:text-[#cccccc]'
                      }`}
                    >
                      {t.guideTabGeneral}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuideTab('advanced')}
                      className={`px-2 py-0.5 rounded-xs text-[10px] font-mono transition-colors cursor-pointer ${
                        guideTab === 'advanced' ? 'bg-[#282828] text-white font-semibold' : 'text-[#777777] hover:text-[#cccccc]'
                      }`}
                    >
                      {t.guideTabAdvanced}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="text-[11px] font-mono text-[#888888] hover:text-white cursor-pointer"
                >
                  {t.close}
                </button>
              </div>

              {guideTab === 'general' ? (
                <div className="grid grid-cols-2 gap-3 text-[11px] leading-relaxed">
                  <div className="flex flex-col gap-1 p-2 bg-[#121212] border border-[#252525] rounded">
                    <span className="font-semibold text-white">{t.guideProfileTitle}</span>
                    <p className="text-[#999999]">{t.guideProfileDesc}</p>
                    <p className="text-[#888888]">{t.guideProfileDraft}</p>
                    <p className="text-[#888888]">{t.guideProfileBalanced}</p>
                    <p className="text-[#888888]">{t.guideProfileQuality}</p>
                  </div>

                  <div className="flex flex-col gap-1 p-2 bg-[#121212] border border-[#252525] rounded">
                    <span className="font-semibold text-white">{t.guidePacingTitle}</span>
                    <p className="text-[#999999]">{t.guidePacingDesc}</p>
                    <p className="text-[#888888]">{t.guidePacingFast}</p>
                    <p className="text-[#888888]">{t.guidePacingBalanced}</p>
                    <p className="text-[#888888]">{t.guidePacingCinematic}</p>
                  </div>

                  <div className="flex flex-col gap-1 p-2 bg-[#121212] border border-[#252525] rounded">
                    <span className="font-semibold text-white">{t.guideCoverageTitle}</span>
                    <p className="text-[#999999]">{t.guideCoverageFill}</p>
                    <p className="text-[#999999]">{t.guideCoverageStrict}</p>
                  </div>

                  <div className="flex flex-col gap-1 p-2 bg-[#121212] border border-[#252525] rounded">
                    <span className="font-semibold text-white">{t.guideFormatTitle}</span>
                    <p className="text-[#999999]">{t.guideFormatDesc}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-[11px] leading-relaxed">
                  <div className="flex flex-col gap-1 p-2 bg-[#121212] border border-[#252525] rounded">
                    <span className="font-semibold text-white">{t.guideWhisperTitle}</span>
                    <p className="text-[#888888]">{t.guideWhisperBase}</p>
                    <p className="text-[#888888]">{t.guideWhisperLarge}</p>
                  </div>

                  <div className="flex flex-col gap-1 p-2 bg-[#121212] border border-[#252525] rounded">
                    <span className="font-semibold text-white">{t.guideAlignmentTitle}</span>
                    <p className="text-[#888888]">{t.guideAlignmentForced}</p>
                    <p className="text-[#888888]">{t.guideAlignmentProportional}</p>
                    <p className="text-[#999999] pt-0.5">{t.guideVadDesc}</p>
                  </div>

                  <div className="flex flex-col gap-1 p-2 bg-[#121212] border border-[#252525] rounded">
                    <span className="font-semibold text-white">{t.guideVisionTitle}</span>
                    <p className="text-[#888888]">{t.guideVisionClip}</p>
                    <p className="text-[#888888]">{t.guideVisionSiglip}</p>
                    <p className="text-[#999999] pt-0.5">{t.guideMinShotDesc}</p>
                    <p className="text-[#999999]">{t.guideConfidenceDesc}</p>
                  </div>

                  <div className="flex flex-col gap-1 p-2 bg-[#121212] border border-[#252525] rounded">
                    <span className="font-semibold text-white">{t.guideSequenceTitle}</span>
                    <p className="text-[#888888]">{t.guideFramerateDesc}</p>
                    <p className="text-[#999999] pt-0.5">{t.guideXmlDesc}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resource Summary Bar */}
          <div className="p-2.5 bg-[#171717] border border-[#262626] rounded flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2 truncate">
              <span className="text-[#777777]">{t.activeVoice}:</span>
              <span className="font-mono text-[#dddddd] truncate max-w-[140px]">{voiceName}</span>
            </div>
            <div className="flex items-center gap-2 truncate">
              <span className="text-[#777777]">{t.script}:</span>
              <span className="font-mono text-[#dddddd] truncate max-w-[140px]">{scriptName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#777777]">{t.footage}:</span>
              <span className="font-mono text-[#dddddd]">{brollAssets.length} {t.clips}</span>
            </div>
          </div>

          {/* SIMPLIFIED / CREATOR-FRIENDLY CONTROLS WITH INTUITIVE SLIDERS */}
          <div className="p-3 bg-[#1a1a1a] border border-[#2b2b2b] rounded flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">
                {t.generalSettings}
              </span>
            </div>

            {/* Slider 1: Speed & Quality */}
            <div className="flex flex-col gap-1.5 p-2.5 bg-[#141414] border border-[#262626] rounded">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#e0e0e0] font-medium">{t.processingProfile}</span>
                <span className="font-mono text-white text-[11px] font-semibold px-2 py-0.5 bg-[#202020] border border-[#333333] rounded">
                  {config.profile === 'draft' ? t.fastDraft : config.profile === 'quality' ? t.highAccuracy : config.profile === 'custom' ? t.custom : t.balanced}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="3"
                step="1"
                value={config.profile === 'draft' ? 1 : config.profile === 'quality' ? 3 : 2}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v === 1) handleProfileChange('draft');
                  else if (v === 3) handleProfileChange('quality');
                  else handleProfileChange('balanced');
                }}
              />
              <div className="flex items-center justify-between text-[10px] text-[#666666] font-mono px-0.5">
                <span>{t.fastDraft}</span>
                <span>{t.balanced}</span>
                <span>{t.highAccuracy}</span>
              </div>
            </div>

            {/* Slider 2: Video Cut Pacing */}
            <div className="flex flex-col gap-1.5 p-2.5 bg-[#141414] border border-[#262626] rounded">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#e0e0e0] font-medium">{t.videoCutPacing}</span>
                <span className="font-mono text-white text-[11px] font-semibold px-2 py-0.5 bg-[#202020] border border-[#333333] rounded">
                  {config.pacingDuration.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min="1.5"
                max="10.0"
                step="0.5"
                value={config.pacingDuration}
                onChange={(e) => {
                  const dur = Number(e.target.value);
                  handlePacingSliderChange(dur);
                }}
              />
              <div className="flex items-center justify-between text-[10px] text-[#666666] font-mono px-0.5">
                <span>1.5s</span>
                <span>5.0s</span>
                <span>10.0s</span>
              </div>
            </div>

            {/* Dropdown Options Row */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* Spoken Language */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#e0e0e0]">{t.narrationLanguage}</label>
                <select
                  value={config.language}
                  onChange={(e) => setConfig((prev) => ({ ...prev, language: e.target.value }))}
                  className="bg-[#121212] text-white border border-[#333333] rounded px-2.5 py-1.5 text-xs outline-none cursor-pointer"
                >
                  <option value="auto">{t.autoDetect}</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                  <option value="ja">Japanese</option>
                  <option value="zh">Chinese</option>
                  <option value="fr">French</option>
                  <option value="es">Spanish</option>
                </select>
              </div>

              {/* Target Format */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#e0e0e0]">{t.targetFormat}</label>
                <select
                  value={config.formatTarget}
                  onChange={(e) => setConfig((prev) => ({ ...prev, formatTarget: e.target.value as any }))}
                  className="bg-[#121212] text-white border border-[#333333] rounded px-2.5 py-1.5 text-xs outline-none cursor-pointer"
                >
                  <option value="1080p">1080p</option>
                  <option value="9:16">9:16</option>
                  <option value="4k">4K</option>
                </select>
              </div>

              {/* Footage Coverage */}
              <div className="flex flex-col col-span-2 gap-1">
                <label className="text-[11px] text-[#e0e0e0]">{t.footageCoverage}</label>
                <select
                  value={config.coverage}
                  onChange={(e) => setConfig((prev) => ({ ...prev, coverage: e.target.value as any }))}
                  className="bg-[#121212] text-white border border-[#333333] rounded px-2.5 py-1.5 text-xs outline-none cursor-pointer"
                >
                  <option value="fill-all">{t.fillEntireVoice}</option>
                  <option value="strict">{t.matchKeySentences}</option>
                </select>
              </div>
            </div>
          </div>

          {/* ADVANCED SETTINGS TOGGLE & SECTION */}
          <div className="p-3 bg-[#171717] border border-[#262626] rounded flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">
                {t.advancedSettings}
              </span>
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="px-2.5 py-1 text-[11px] font-mono text-[#aaaaaa] hover:text-white bg-[#1f1f1f] hover:bg-[#282828] border border-[#383838] rounded transition-colors cursor-pointer"
              >
                {showAdvanced ? t.hideAdvanced : t.showAdvanced}
              </button>
            </div>

            {showAdvanced && (
              <div className="flex flex-col gap-3 pt-2 border-t border-[#252525]">
                {/* Advanced Sliders */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Slider: Min Shot Duration */}
                  <div className="flex flex-col gap-1 p-2 bg-[#121212] border border-[#292929] rounded">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] text-[#cccccc]">{t.minShotDuration}</span>
                      <span className="font-mono text-white text-[10px] px-1.5 py-0.5 bg-[#1a1a1a] border border-[#333333] rounded">
                        {Number(config.minShotDuration).toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="8.0"
                      step="0.5"
                      value={Number(config.minShotDuration)}
                      onChange={(e) => updateAdvancedField('minShotDuration', e.target.value)}
                    />
                    <div className="flex items-center justify-between text-[9px] text-[#555555] font-mono px-0.5">
                      <span>1.0s</span>
                      <span>4.0s</span>
                      <span>8.0s</span>
                    </div>
                  </div>

                  {/* Slider: Match Confidence Filter */}
                  <div className="flex flex-col gap-1 p-2 bg-[#121212] border border-[#292929] rounded">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] text-[#cccccc]">{t.confidenceFilter}</span>
                      <span className="font-mono text-white text-[10px] px-1.5 py-0.5 bg-[#1a1a1a] border border-[#333333] rounded">
                        {config.confidenceThreshold}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      step="5"
                      value={Number(config.confidenceThreshold)}
                      onChange={(e) => updateAdvancedField('confidenceThreshold', e.target.value)}
                    />
                    <div className="flex items-center justify-between text-[9px] text-[#555555] font-mono px-0.5">
                      <span>50%</span>
                      <span>80%</span>
                      <span>95%</span>
                    </div>
                  </div>
                </div>

                {/* Advanced Group 1: Audio & Transcription */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-[#222222]">
                  <span className="text-[11px] text-[#777777] font-semibold">{t.speechAlignmentEngine}</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-[#777777]">{t.whisperModel}</label>
                      <select
                        value={config.whisperModel}
                        onChange={(e) => updateAdvancedField('whisperModel', e.target.value)}
                        className="bg-[#111111] text-white border border-[#303030] rounded px-2 py-1 text-xs outline-none cursor-pointer"
                      >
                        <option value="base">Whisper Base</option>
                        <option value="small">Whisper Small</option>
                        <option value="medium">Whisper Medium</option>
                        <option value="large-v3">Whisper Large-v3</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-[#777777]">{t.alignmentMode}</label>
                      <select
                        value={config.alignmentMode}
                        onChange={(e) => updateAdvancedField('alignmentMode', e.target.value)}
                        className="bg-[#111111] text-white border border-[#303030] rounded px-2 py-1 text-xs outline-none cursor-pointer"
                      >
                        <option value="forced">{t.forcedWordAlignment}</option>
                        <option value="proportional">{t.proportionalFallback}</option>
                      </select>
                    </div>

                    <div className="flex flex-col col-span-2 gap-0.5">
                      <label className="text-[10px] text-[#777777]">{t.vadFilter}</label>
                      <select
                        value={config.vadFilter ? 'true' : 'false'}
                        onChange={(e) => updateAdvancedField('vadFilter', e.target.value === 'true')}
                        className="bg-[#111111] text-white border border-[#303030] rounded px-2 py-1 text-xs outline-none cursor-pointer"
                      >
                        <option value="true">{t.enabled}</option>
                        <option value="false">{t.disabled}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Advanced Group 2: Visual Models */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-[#222222]">
                  <span className="text-[11px] text-[#777777] font-semibold">{t.visionModelEngine}</span>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-[#777777]">{t.visionModel}</label>
                    <select
                      value={config.visualModel}
                      onChange={(e) => updateAdvancedField('visualModel', e.target.value)}
                      className="bg-[#111111] text-white border border-[#303030] rounded px-2 py-1 text-xs outline-none cursor-pointer"
                    >
                      <option value="clip-vit-b32">CLIP ViT-B/32</option>
                      <option value="clip-vit-l14">CLIP ViT-L/14</option>
                      <option value="siglip">SigLIP</option>
                    </select>
                  </div>
                </div>

                {/* Advanced Group 3: Sequence Specs */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-[#222222]">
                  <span className="text-[11px] text-[#777777] font-semibold">{t.sequenceExportProtocol}</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-[#777777]">{t.sequenceFramerate}</label>
                      <select
                        value={config.framerate}
                        onChange={(e) => updateAdvancedField('framerate', e.target.value)}
                        className="bg-[#111111] text-white border border-[#303030] rounded px-2 py-1 text-xs outline-none cursor-pointer"
                      >
                        <option value="24">24 fps</option>
                        <option value="25">25 fps</option>
                        <option value="29.97">29.97 fps</option>
                        <option value="30">30 fps</option>
                        <option value="60">60 fps</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-[#777777]">{t.xmlExportProtocol}</label>
                      <select
                        value={config.xmlFormat}
                        onChange={(e) => updateAdvancedField('xmlFormat', e.target.value)}
                        className="bg-[#111111] text-white border border-[#303030] rounded px-2 py-1 text-xs outline-none cursor-pointer"
                      >
                        <option value="fcp7xml">Premiere Pro XML</option>
                        <option value="edl">EDL File</option>
                        <option value="json">JSON Markers</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Matched Scenes List View */
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
          {segments.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-[#666666] bg-[#1a1a1a] rounded border border-[#2b2b2b]">
              <span className="text-xs font-medium text-[#808080] mb-1">{t.noScenesAligned}</span>
              <span className="text-[11px] text-[#555555]">
                {t.noScenesPrompt}
              </span>
            </div>
          ) : (
            segments.map((seg) => {
              const timeRange = `${secondsToTimeString(seg.startTime)} - ${secondsToTimeString(seg.endTime)}`;
              const confidence = seg.matchConfidence ? `${seg.matchConfidence.toFixed(0)}% ${t.match}` : t.matched;

              return (
                <div
                  key={seg.id}
                  onClick={() => onSelectSegment(seg)}
                  className="p-2.5 bg-[#1a1a1a] hover:bg-[#222222] border border-[#2e2e2e] hover:border-[#444444] rounded flex flex-col gap-1 cursor-pointer transition-colors"
                >
                  {/* Header Row: Scene Badge | Time Range | Footage Name | Match Score */}
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 bg-[#121212] border border-[#2e2e2e] text-white font-mono font-semibold rounded text-[10px]">
                        {t.scene} {seg.id.toString().padStart(2, '0')}
                      </span>
                      <span className="text-[#a0a0a0] font-mono">
                        {timeRange} ({seg.duration.toFixed(1)}s)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[#888888] font-mono truncate max-w-[140px]" title={seg.sourceMediaName}>
                        {seg.sourceMediaName}
                      </span>
                      <span className="px-1.5 py-0.5 bg-[#141414] text-[#cccccc] border border-[#333333] rounded font-mono text-[10px]">
                        {confidence}
                      </span>
                    </div>
                  </div>

                  {/* Body Row: Spoken Sentence Narration */}
                  <p className="text-[#cccccc] text-xs leading-snug line-clamp-2 pt-0.5 font-normal">
                    "{seg.text}"
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
