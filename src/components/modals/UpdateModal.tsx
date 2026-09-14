import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../i18n';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  assets?: ReleaseAsset[];
}

interface UpdateProgressPayload {
  downloaded: number;
  total: number;
  percent: number;
  status: 'downloading' | 'installing';
}

const GITHUB_REPO = 'pecora31/SyncCut';
const RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASES_WEB_URL = `https://github.com/${GITHUB_REPO}/releases`;

function compareVersions(v1: string, v2: string): number {
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

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const [currentVersion, setCurrentVersion] = useState<string>('0.1.3');
  const [status, setStatus] = useState<'checking' | 'up-to-date' | 'available' | 'no-release' | 'error'>('checking');
  const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastCheckedTime, setLastCheckedTime] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updateStepText, setUpdateStepText] = useState<string>('');
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgressPayload | null>(null);

  // Fetch current version dynamically from Tauri
  useEffect(() => {
    invoke<string>('get_app_version')
      .then((ver) => {
        if (ver) setCurrentVersion(ver);
      })
      .catch(() => {});
  }, []);

  // Listen to background download progress events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<UpdateProgressPayload>('update-download-progress', (event) => {
      setDownloadProgress(event.payload);
      if (event.payload.status === 'installing') {
        setUpdateStepText(
          language === 'vi'
            ? 'Đang tự động cài đặt và khởi động lại SyncCut...'
            : 'Installing update and restarting SyncCut...'
        );
      } else {
        const cur = formatBytes(event.payload.downloaded);
        const tot = formatBytes(event.payload.total);
        const pct = Math.round(event.payload.percent);
        setUpdateStepText(
          language === 'vi'
            ? `Đang tải: ${cur} / ${tot} (${pct}%)`
            : `Downloading: ${cur} / ${tot} (${pct}%)`
        );
      }
    })
      .then((u) => {
        unlisten = u;
      })
      .catch((err) => {
        console.warn('Could not listen to update-download-progress:', err);
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [language]);

  const checkForUpdates = async () => {
    setStatus('checking');
    setErrorMessage('');
    setIsUpdating(false);
    setUpdateStepText('');
    setDownloadProgress(null);

    try {
      const ver = await invoke<string>('get_app_version').catch(() => currentVersion);
      if (ver) setCurrentVersion(ver);

      const res = await fetch(RELEASES_API_URL, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      });

      setLastCheckedTime(new Date().toLocaleTimeString());

      if (res.status === 404) {
        setStatus('no-release');
        return;
      }

      if (!res.ok) {
        setStatus('error');
        setErrorMessage(`GitHub API responded with status ${res.status}`);
        return;
      }

      const data: GitHubRelease = await res.json();
      setLatestRelease(data);

      const isNewer = compareVersions(data.tag_name, ver || currentVersion) > 0;
      if (isNewer) {
        setStatus('available');
      } else {
        setStatus('up-to-date');
      }
    } catch (err: any) {
      console.warn('Update check error:', err);
      setStatus('error');
      setErrorMessage(err?.message || 'Network connection failed');
      setLastCheckedTime(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkForUpdates();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenUrl = async (url: string) => {
    try {
      await invoke('open_directory', { path: url });
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleAutoUpdate = async () => {
    if (!latestRelease || isUpdating) return;

    // Find the Windows setup installer (.exe)
    const installerAsset = latestRelease.assets?.find(
      (a) => a.name.toLowerCase().endsWith('-setup.exe') || a.name.toLowerCase().endsWith('.exe')
    );

    if (!installerAsset) {
      handleOpenUrl(latestRelease.html_url);
      return;
    }

    setIsUpdating(true);
    setDownloadProgress({
      downloaded: 0,
      total: installerAsset.size,
      percent: 0,
      status: 'downloading',
    });
    setUpdateStepText(
      language === 'vi'
        ? `Bắt đầu tải ${installerAsset.name} (${formatBytes(installerAsset.size)})...`
        : `Starting download of ${installerAsset.name} (${formatBytes(installerAsset.size)})...`
    );

    try {
      await invoke('download_and_install_update', {
        downloadUrl: installerAsset.browser_download_url,
        totalBytes: installerAsset.size,
      });

      setUpdateStepText(
        language === 'vi'
          ? 'Đang khởi chạy bộ cài đặt và khởi động lại SyncCut...'
          : 'Launching installer and relaunching SyncCut...'
      );
    } catch (err: any) {
      console.error('Auto update error:', err);
      setIsUpdating(false);
      setDownloadProgress(null);
      const msg = typeof err === 'string' ? err : err?.message || 'Automatic update failed';
      setErrorMessage(msg);
      setStatus('error');
    }
  };

  const installerAsset = latestRelease?.assets?.find(
    (a) => a.name.toLowerCase().endsWith('-setup.exe') || a.name.toLowerCase().endsWith('.exe')
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 select-none p-4 font-sans">
      <div className="w-full max-w-lg bg-[#1a1a1a] border border-[#333333] rounded shadow-2xl flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="h-10 px-4 bg-[#222222] border-b border-[#2e2e2e] flex items-center justify-between">
          <span className="font-semibold text-white tracking-wide">
            {language === 'vi' ? 'Cập nhật phần mềm' : 'Software Update'}
          </span>
          <button
            type="button"
            disabled={isUpdating}
            onClick={onClose}
            className="text-[#888888] hover:text-white px-2 py-0.5 rounded hover:bg-[#333333] transition-colors cursor-pointer disabled:opacity-40"
          >
            {language === 'vi' ? 'Đóng' : 'Close'}
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-3 font-sans">
          {/* Version Info Header */}
          <div className="flex items-center justify-between bg-[#141414] border border-[#2a2a2a] p-3 rounded font-mono text-[11px]">
            <div>
              <span className="text-[#888888]">
                {language === 'vi' ? 'Bản hiện tại: ' : 'Installed Version: '}
              </span>
              <span className="text-white font-bold ml-1">v{currentVersion}</span>
            </div>
            {lastCheckedTime && (
              <div className="text-[#666666]">
                {language === 'vi' ? 'Kiểm tra: ' : 'Checked: '}
                {lastCheckedTime}
              </div>
            )}
          </div>

          {/* Status Display Area */}
          {status === 'checking' && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 bg-[#121212] border border-[#262626] rounded">
              <span className="text-white font-medium text-xs">
                {language === 'vi' ? 'Đang kiểm tra bản phát hành trên GitHub...' : 'Checking for updates on GitHub...'}
              </span>
              <span className="text-[#666666] font-mono text-[10px]">
                {language === 'vi' ? 'Vui lòng chờ trong giây lát...' : 'Please wait a moment...'}
              </span>
            </div>
          )}

          {status === 'up-to-date' && (
            <div className="flex flex-col items-center justify-center py-6 gap-2 bg-[#141414] border border-[#2a2a2a] rounded">
              <span className="text-white font-semibold text-xs">
                {language === 'vi' ? 'Bạn đang sử dụng phiên bản mới nhất' : 'SyncCut is up to date'}
              </span>
              <span className="text-[#888888] font-mono text-[11px]">
                v{currentVersion}
              </span>
              <button
                type="button"
                onClick={checkForUpdates}
                className="mt-2 px-3 py-1 bg-[#242424] hover:bg-[#303030] text-[#cccccc] hover:text-white border border-[#3e3e3e] rounded font-mono text-[11px] transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Kiểm tra lại' : 'Check Again'}
              </button>
            </div>
          )}

          {status === 'available' && latestRelease && (
            <div className="flex flex-col gap-3 bg-[#141414] border border-[#383838] p-3 rounded">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white font-bold text-xs">
                    {language === 'vi' ? 'Đã có phiên bản mới' : 'New Version Available'}
                  </span>
                  <span className="ml-2 font-mono text-[#ffffff] bg-[#2a2a2a] px-1.5 py-0.5 rounded text-[11px] border border-[#444444]">
                    {latestRelease.tag_name}
                  </span>
                </div>
                <span className="text-[#888888] font-mono text-[10px]">
                  {new Date(latestRelease.published_at).toLocaleDateString()}
                </span>
              </div>

              {latestRelease.name && (
                <div className="text-[#cccccc] font-medium text-[11px]">
                  {latestRelease.name}
                </div>
              )}

              {/* Release Notes */}
              {latestRelease.body && (
                <div className="flex flex-col gap-1">
                  <span className="text-[#777777] font-mono text-[10px]">
                    {language === 'vi' ? 'Chi tiết bản cập nhật:' : 'Changelog / Release Notes:'}
                  </span>
                  <div className="bg-[#0e0e0e] border border-[#222222] rounded p-2 text-[#aaaaaa] font-mono text-[10.5px] max-h-32 overflow-y-auto whitespace-pre-wrap select-text">
                    {latestRelease.body}
                  </div>
                </div>
              )}

              {/* Update Progress Indicator */}
              {isUpdating && (
                <div className="flex flex-col gap-2 p-3 bg-[#111111] border border-[#444444] rounded">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-white font-medium">
                      {updateStepText || (language === 'vi' ? 'Đang thực hiện cập nhật...' : 'Updating SyncCut...')}
                    </span>
                    {downloadProgress && downloadProgress.percent > 0 && (
                      <span className="text-white font-bold">
                        {Math.round(downloadProgress.percent)}%
                      </span>
                    )}
                  </div>
                  <div className="h-2 bg-[#222222] rounded overflow-hidden border border-[#333333]">
                    <div
                      className="h-full bg-white transition-all duration-200"
                      style={{ width: `${Math.max(4, Math.min(100, downloadProgress?.percent || 4))}%` }}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-[#888888]">
                    {language === 'vi'
                      ? 'SyncCut sẽ tự động cập nhật và khởi động lại phiên bản mới ngay sau khi tải xong.'
                      : 'SyncCut will automatically apply the update and relaunch once downloaded.'}
                  </div>
                </div>
              )}

              {/* Primary Action Button: 1-Click Auto Update & Install */}
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={handleAutoUpdate}
                  className="flex-1 py-2.5 bg-[#2d2d2d] hover:bg-[#383838] active:bg-[#404040] disabled:bg-[#1f1f1f] text-white font-semibold rounded border border-[#555555] disabled:border-[#333333] transition-colors cursor-pointer text-center text-xs"
                >
                  {isUpdating
                    ? (language === 'vi' ? 'Đang tự động xử lý...' : 'Updating...')
                    : (language === 'vi'
                      ? `Tự động cập nhật & Khởi động lại (${installerAsset ? formatBytes(installerAsset.size) : 'Bản mới'})`
                      : `Update & Restart (${installerAsset ? formatBytes(installerAsset.size) : 'New Build'})`)}
                </button>

                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => handleOpenUrl(latestRelease.html_url)}
                  className="px-3 py-2.5 bg-[#202020] hover:bg-[#282828] text-[#888888] hover:text-white border border-[#333333] rounded transition-colors cursor-pointer text-center text-xs"
                  title="View on GitHub"
                >
                  {language === 'vi' ? 'Xem trên Web' : 'View on Web'}
                </button>
              </div>
            </div>
          )}

          {status === 'no-release' && (
            <div className="flex flex-col gap-2.5 bg-[#141414] border border-[#2a2a2a] p-3 rounded">
              <div className="text-white font-semibold">
                {language === 'vi' ? 'Sẵn sàng nhận bản phát hành GitHub' : 'GitHub Releases Connected'}
              </div>
              <p className="text-[#999999] text-[11px] leading-relaxed">
                {language === 'vi'
                  ? 'Hiện tại chưa có bản Release build nào mới hơn trên GitHub.'
                  : 'No newer release build is available on GitHub at this time.'}
              </p>
              <div className="flex items-center gap-2 pt-1 font-mono">
                <button
                  type="button"
                  onClick={() => handleOpenUrl(RELEASES_WEB_URL)}
                  className="px-3 py-1 bg-[#262626] hover:bg-[#333333] text-white border border-[#3e3e3e] rounded text-[11px] transition-colors cursor-pointer"
                >
                  {language === 'vi' ? 'Mở GitHub Releases' : 'Open GitHub Releases'}
                </button>
                <button
                  type="button"
                  onClick={checkForUpdates}
                  className="px-3 py-1 bg-[#262626] hover:bg-[#333333] text-[#cccccc] hover:text-white border border-[#3e3e3e] rounded text-[11px] transition-colors cursor-pointer"
                >
                  {language === 'vi' ? 'Kiểm tra lại' : 'Check Again'}
                </button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col gap-2 bg-[#191414] border border-[#382828] p-3 rounded">
              <span className="text-white font-semibold">
                {language === 'vi' ? 'Không thể cập nhật tự động' : 'Update Failed'}
              </span>
              <span className="text-[#ff8888] text-[11px]">
                {errorMessage || (language === 'vi' ? 'Vui lòng kiểm tra kết nối mạng.' : 'Please check your internet connection.')}
              </span>
              <div className="flex items-center gap-2 pt-1 font-mono">
                <button
                  type="button"
                  onClick={checkForUpdates}
                  className="px-3 py-1 bg-[#282828] hover:bg-[#333333] text-white border border-[#3e3e3e] rounded text-[11px] transition-colors cursor-pointer"
                >
                  {language === 'vi' ? 'Thử lại' : 'Retry'}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenUrl(RELEASES_WEB_URL)}
                  className="px-3 py-1 bg-[#282828] hover:bg-[#333333] text-[#aaaaaa] hover:text-white border border-[#3e3e3e] rounded text-[11px] transition-colors cursor-pointer"
                >
                  {language === 'vi' ? 'Tải thủ công từ GitHub' : 'Download Manually from GitHub'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-10 px-4 bg-[#202020] border-t border-[#2e2e2e] flex items-center justify-end">
          <button
            type="button"
            disabled={isUpdating}
            onClick={onClose}
            className="px-4 py-1.5 bg-[#333333] hover:bg-[#404040] text-white font-medium rounded transition-colors cursor-pointer disabled:opacity-40"
          >
            {language === 'vi' ? 'Đóng' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
