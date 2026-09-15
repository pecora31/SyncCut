import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { MediaAsset } from '../../types';

interface VideoQualityOption {
  label: string;
  height: number;
  fps: number | null;
  formatId: string;
  vcodec: string;
  approxSizeMb: number | null;
}

interface AudioQualityOption {
  label: string;
  abr: number;
  formatId: string;
  acodec: string;
  ext: string;
}

interface YouTubeMetadata {
  id: string;
  title: string;
  channel: string;
  duration: number;
  durationString: string;
  availableVideoQualities: VideoQualityOption[];
  availableAudioQualities: AudioQualityOption[];
}

interface YouTubeDownloadModalProps {
  isOpen: boolean;
  outputDir: string;
  onClose: () => void;
  onPickOutputDir: () => void;
  onMediaDownloaded: (asset: MediaAsset) => void;
}

function cleanYouTubeUrl(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim().replace(/^["'<(\[]+|[>"')\]]+$/g, '');
  const urlMatch = trimmed.match(/https?:\/\/[^\s"'>]+/i);
  return (urlMatch ? urlMatch[0] : trimmed).trim();
}

function isYouTubeUrl(val: string): boolean {
  const clean = cleanYouTubeUrl(val);
  return /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?(?:youtube\.com|youtu\.be)\/.+/i.test(clean);
}
function isPlaylistUrl(val: string): boolean {
  try { return new URL(cleanYouTubeUrl(val)).searchParams.has('list'); } catch { return /[?&]list=/.test(val); }
}

export const YouTubeDownloadModal: React.FC<YouTubeDownloadModalProps> = ({
  isOpen,
  outputDir,
  onClose,
  onPickOutputDir,
  onMediaDownloaded,
}) => {
  const [url, setUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [metadata, setMetadata] = useState<YouTubeMetadata | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [mode, setMode] = useState<'full_video' | 'audio_only' | 'video_only'>('full_video');
  const [downloadVideoHeight, setDownloadVideoHeight] = useState<number | null>(null);
  const [videoContainer, setVideoContainer] = useState('mp4');
  const [selectedAudioAbr, setSelectedAudioAbr] = useState<number | null>(null);
  const [audioContainer, setAudioContainer] = useState('wav');
  const [downloadPlaylist, setDownloadPlaylist] = useState(false);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    percent: number;
    speed: string;
    eta: string;
    downloaded?: string;
    total?: string;
    status: string;
  } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<any>('youtube-download-progress', (event) => {
      if (event.payload) {
        setDownloadProgress(event.payload);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const fetchMetadataForUrl = async (targetUrl: string) => {
    const cleaned = cleanYouTubeUrl(targetUrl);
    if (!cleaned) {
      setMetadata(null);
      return;
    }

    setIsFetching(true);
    setFetchError(null);
    setMetadata(null);
    setDownloadError(null);
    setDownloadProgress(null);

    try {
      const data = await invoke<YouTubeMetadata>('fetch_youtube_metadata', { url: cleaned });
      setMetadata(data);
      if (data.availableVideoQualities && data.availableVideoQualities.length > 0) {
        setDownloadVideoHeight(data.availableVideoQualities[0].height);
      }
      if (data.availableAudioQualities && data.availableAudioQualities.length > 0) {
        setSelectedAudioAbr(data.availableAudioQualities[0].abr);
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      setFetchError(err?.message || err?.toString() || 'Unable to fetch video details');
    } finally {
      setIsFetching(false);
    }
  };

  const handleUrlChange = (newVal: string) => {
    setUrl(newVal);
    const cleaned = cleanYouTubeUrl(newVal);
    if (!cleaned) {
      setMetadata(null);
      setFetchError(null);
      setDownloadError(null);
      setDownloadProgress(null);
      return;
    }

    // Clear old metadata if URL is changed to a different video
    if (metadata && !cleaned.includes(metadata.id)) {
      setMetadata(null);
      setFetchError(null);
      setDownloadError(null);
      setDownloadProgress(null);
    }
  };

  // Instant auto-fetch when pasting a YouTube link
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    const cleaned = cleanYouTubeUrl(pastedText);
    if (cleaned) {
      e.preventDefault();
      setUrl(cleaned);
      setMetadata(null);
      setFetchError(null);
      setDownloadError(null);
      setDownloadProgress(null);
      if (isYouTubeUrl(cleaned)) {
        fetchMetadataForUrl(cleaned);
      }
    }
  };

  // Debounce auto-fetch when typing or autofilling a valid YouTube link
  useEffect(() => {
    const cleaned = cleanYouTubeUrl(url);
    if (!cleaned) {
      setMetadata(null);
      setFetchError(null);
      setDownloadError(null);
      return;
    }

    if (isYouTubeUrl(cleaned) && (!metadata || !cleaned.includes(metadata.id)) && !isFetching) {
      const timer = setTimeout(() => {
        fetchMetadataForUrl(cleaned);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [url]);

  if (!isOpen) return null;

  const handleStartDownload = async () => {
    if (!url.trim()) return;

    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress({ percent: 0, speed: '', eta: '', status: 'Starting download...' });

    try {
      const savedPath = await invoke<string>('download_youtube_media', {
        options: {
          url: url.trim(),
          outputDir: outputDir || 'media_pool',
          mode,
          videoHeight: downloadVideoHeight,
          videoContainer,
          audioAbr: selectedAudioAbr,
          audioContainer,
          timeRangeStart: null,
          timeRangeEnd: null,
          downloadPlaylist,
        },
      });

      let realSizeBytes = 0;
      let realDuration = metadata?.duration;
      try {
        const fileInfo = await invoke<{ sizeBytes: number; duration?: number }>('get_file_media_info', {
          path: savedPath,
        });
        if (fileInfo) {
          realSizeBytes = fileInfo.sizeBytes;
          if (fileInfo.duration) realDuration = fileInfo.duration;
        }
      } catch {
        // Fallback to metadata duration
      }

      const newAsset: MediaAsset = {
        id: `yt_${Date.now()}`,
        name: savedPath.split(/[/\\]/).pop() || 'Downloaded Video',
        path: savedPath,
        fileType: mode === 'audio_only' ? 'voice' : 'video',
        sizeBytes: realSizeBytes,
        duration: realDuration,
      };
      onMediaDownloaded(newAsset);
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadError(err?.message || err?.toString() || 'Failed to download media');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-none p-4 select-none"
      onClick={()=>{if(!isDownloading)onClose();}}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-[#202020] border border-[#444444] rounded shadow-2xl p-4 flex flex-col gap-3 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#303030] pb-2">
          <span className="font-semibold text-white text-xs">
            YouTube Downloader
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="px-2 py-0.5 text-xs text-[#808080] hover:text-white rounded transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* URL Input */}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              placeholder="Paste YouTube URL (https://...)"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => e.key === 'Enter' && fetchMetadataForUrl(url)}
              className="flex-1 px-3 py-2 bg-[#141414] border border-[#383838] focus:border-[#666666] rounded text-[#e6e6e6] text-xs outline-none font-mono"
            />
          </div>

          {isPlaylistUrl(url) && (
            <div className="text-[#e8c783] text-[11px] bg-[#302719] p-2 rounded border border-[#6b5730] leading-relaxed">
              <strong>Playlist detected.</strong> Downloading every item may take a long time and use substantial disk space.
              <label className="mt-2 flex items-center gap-2 text-[#f1d99e]"><input type="checkbox" checked={downloadPlaylist} onChange={(e) => setDownloadPlaylist(e.target.checked)} /> Download the entire playlist</label>
            </div>
          )}

          {fetchError && (
            <div className="text-[#cca0a0] text-[11px] bg-[#2d1a1a] p-2 rounded border border-[#552a2a] font-mono leading-relaxed">
              {fetchError}
            </div>
          )}

          {metadata && metadata.id && (
            <div className="w-full aspect-video max-h-[190px] bg-black rounded overflow-hidden shadow-md">
              <iframe
                src={`https://www.youtube.com/embed/${metadata.id}?enablejsapi=1&controls=1&rel=0&playsinline=1`}
                title={metadata.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          )}
        </div>

        {/* Mode Selector */}
        <div className="flex flex-col gap-1">
          <span className="text-[#888888] font-medium text-[11px]">Mode</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMode('full_video')}
              className={`py-1.5 rounded border text-center transition-all cursor-pointer ${
                mode === 'full_video'
                  ? 'bg-[#e8e8e8] border-[#f5f5f5] text-[#111111] font-semibold shadow-[0_0_0_1px_#e8e8e8]'
                  : 'bg-[#181818] border-[#303030] text-[#888888] hover:text-white'
              }`}
            >
              Video + Audio
            </button>
            <button
              type="button"
              onClick={() => setMode('audio_only')}
              className={`py-1.5 rounded border text-center transition-all cursor-pointer ${
                mode === 'audio_only'
                  ? 'bg-[#e8e8e8] border-[#f5f5f5] text-[#111111] font-semibold shadow-[0_0_0_1px_#e8e8e8]'
                  : 'bg-[#181818] border-[#303030] text-[#888888] hover:text-white'
              }`}
            >
              Audio Only
            </button>
            <button
              type="button"
              onClick={() => setMode('video_only')}
              className={`py-1.5 rounded border text-center transition-all cursor-pointer ${
                mode === 'video_only'
                  ? 'bg-[#e8e8e8] border-[#f5f5f5] text-[#111111] font-semibold shadow-[0_0_0_1px_#e8e8e8]'
                  : 'bg-[#181818] border-[#303030] text-[#888888] hover:text-white'
              }`}
            >
              Video Only
            </button>
          </div>
        </div>

        {/* Format Selection */}
        {mode !== 'audio_only' && (
          <div className="grid grid-cols-[minmax(180px,1fr)_92px] gap-2">
            <select
              disabled={!metadata}
              value={downloadVideoHeight || ''}
              onChange={(e) => setDownloadVideoHeight(Number(e.target.value))}
              className="w-full px-3 py-1.5 bg-[#141414] border border-[#383838] rounded text-[#e6e6e6] text-xs font-mono outline-none disabled:opacity-50"
            >
              {metadata?.availableVideoQualities && metadata.availableVideoQualities.length > 0 ? (
                metadata.availableVideoQualities.map((vq) => (
                  <option key={vq.formatId} value={vq.height}>{vq.label}</option>
                ))
              ) : (
                <option value="">Best Resolution</option>
              )}
            </select>

            <select
              value={videoContainer}
              onChange={(e) => setVideoContainer(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#141414] border border-[#383838] rounded text-[#e6e6e6] text-xs font-mono outline-none"
            >
              <option value="mp4">.mp4</option>
              <option value="mkv">.mkv</option>
              <option value="mov">.mov</option>
            </select>
          </div>
        )}

        {mode === 'audio_only' && (
          <div className="grid grid-cols-[minmax(180px,1fr)_92px] gap-2">
            <select
              disabled={!metadata}
              value={selectedAudioAbr || ''}
              onChange={(e) => setSelectedAudioAbr(Number(e.target.value))}
              className="w-full px-3 py-1.5 bg-[#141414] border border-[#383838] rounded text-[#e6e6e6] text-xs font-mono outline-none disabled:opacity-50"
            >
              {metadata?.availableAudioQualities && metadata.availableAudioQualities.length > 0 ? (
                metadata.availableAudioQualities.map((aq) => (
                  <option key={aq.formatId} value={aq.abr}>{aq.label}</option>
                ))
              ) : (
                <option value="">Best Audio</option>
              )}
            </select>

            <select
              value={audioContainer}
              onChange={(e) => setAudioContainer(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#141414] border border-[#383838] rounded text-[#e6e6e6] text-xs font-mono outline-none"
            >
              <option value="wav">.wav</option>
              <option value="mp3">.mp3</option>
              <option value="m4a">.m4a</option>
            </select>
          </div>
        )}

        {/* Destination Folder */}
        <div className="flex items-center justify-between p-2 bg-[#181818] border border-[#2d2d2d] rounded">
          <span className="text-[11px] font-mono text-[#808080] truncate max-w-[340px]">
            {outputDir || 'media_pool'}
          </span>
          <button
            type="button"
            onClick={onPickOutputDir}
            className="px-2 py-1 text-[11px] bg-[#252525] hover:bg-[#303030] text-[#cccccc] border border-[#383838] rounded cursor-pointer"
          >
            Change
          </button>
        </div>

        {downloadError && (
          <div className="p-2 bg-[#2d1a1a] border border-[#552a2a] rounded text-[11px] text-[#cca0a0] font-mono leading-relaxed">
            {downloadError}
          </div>
        )}

        {/* Download Action Button with integrated thin bottom progress bar */}
        <button
          type="button"
          disabled={isDownloading || !metadata || isFetching}
          onClick={handleStartDownload}
          className="w-full relative overflow-hidden py-2.5 px-3 bg-[#2d2d2d] hover:bg-[#3a3a3a] disabled:bg-[#181818] disabled:text-[#555555] text-white font-medium text-xs rounded border border-[#444444] transition-colors cursor-pointer"
        >
          {/* Main button label and real-time download metrics */}
          <div className="flex items-center justify-between gap-2 font-mono">
            <span>
              {isDownloading
                ? `Downloading ${downloadProgress?.percent ? downloadProgress.percent.toFixed(0) : 0}%`
                : isFetching
                  ? 'Getting video details...'
                  : metadata
                    ? 'Download & Add to Media Pool'
                    : 'Paste YouTube link to download'}
            </span>

            {isDownloading && downloadProgress && (
              <span className="text-[10px] text-[#cccccc] font-normal truncate">
                {[
                  downloadProgress.downloaded && downloadProgress.total
                    ? `${downloadProgress.downloaded} / ${downloadProgress.total}`
                    : downloadProgress.total || null,
                  downloadProgress.speed || null,
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </span>
            )}
          </div>

          {/* Thin progress bar pinned to the bottom edge inside the button */}
          {isDownloading && (
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/50 overflow-hidden pointer-events-none">
              <div
                className="h-full bg-white transition-all duration-150"
                style={{ width: `${Math.max(2, Math.min(100, downloadProgress?.percent || 0))}%` }}
              />
            </div>
          )}
        </button>
      </div>
    </div>
  );
};
