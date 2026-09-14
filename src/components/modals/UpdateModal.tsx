import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../i18n';
import { invoke } from '@tauri-apps/api/core';

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

const CURRENT_VERSION = '0.1.0';
const GITHUB_REPO = 'pecora31/prototype-VAE';
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
  const [status, setStatus] = useState<'checking' | 'up-to-date' | 'available' | 'no-release' | 'error'>('checking');
  const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastCheckedTime, setLastCheckedTime] = useState<string>('');

  const checkForUpdates = async () => {
    setStatus('checking');
    setErrorMessage('');
    try {
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

      const isNewer = compareVersions(data.tag_name, CURRENT_VERSION) > 0;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 select-none p-4">
      <div className="w-full max-w-lg bg-[#1a1a1a] border border-[#333333] rounded shadow-2xl flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="h-10 px-4 bg-[#222222] border-b border-[#2e2e2e] flex items-center justify-between">
          <span className="font-semibold text-white tracking-wide">
            {language === 'vi' ? 'Cập nhật phần mềm' : 'Software Update'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#888888] hover:text-white px-2 py-0.5 rounded hover:bg-[#333333] transition-colors cursor-pointer"
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
              <span className="text-white font-bold ml-1">v{CURRENT_VERSION}</span>
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
                v{CURRENT_VERSION}
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
                  <div className="bg-[#0e0e0e] border border-[#222222] rounded p-2 text-[#aaaaaa] font-mono text-[10.5px] max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
                    {latestRelease.body}
                  </div>
                </div>
              )}

              {/* Assets list if available */}
              {latestRelease.assets && latestRelease.assets.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[#777777] font-mono text-[10px]">
                    {language === 'vi' ? 'Gói cài đặt:' : 'Installers & Assets:'}
                  </span>
                  <div className="flex flex-col gap-1">
                    {latestRelease.assets.map((asset) => (
                      <div
                        key={asset.name}
                        className="flex items-center justify-between bg-[#1b1b1b] px-2 py-1 rounded border border-[#2d2d2d] font-mono text-[10px]"
                      >
                        <span className="text-[#cccccc] truncate">{asset.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[#777777]">{formatBytes(asset.size)}</span>
                          <button
                            type="button"
                            onClick={() => handleOpenUrl(asset.browser_download_url)}
                            className="px-2 py-0.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-white rounded transition-colors cursor-pointer"
                          >
                            {language === 'vi' ? 'Tải về' : 'Download'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => handleOpenUrl(latestRelease.html_url)}
                  className="flex-1 py-1.5 bg-[#333333] hover:bg-[#404040] text-white font-semibold rounded border border-[#555555] transition-colors cursor-pointer text-center"
                >
                  {language === 'vi' ? 'Mở trang tải bản cập nhật' : 'Download Update on GitHub'}
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
                  ? 'Hiện tại chưa có bản Release build nào được phát hành trên GitHub. Sau khi bạn đẩy mã nguồn lên và tạo Release, ứng dụng sẽ tự động phát hiện và cung cấp bản tải xuống tại đây.'
                  : 'No release builds have been published on GitHub yet. Once you push the repository and publish a release, the app will automatically detect and download updates here.'}
              </p>
              <div className="flex items-center gap-2 pt-1 font-mono">
                <button
                  type="button"
                  onClick={() => handleOpenUrl(RELEASES_WEB_URL)}
                  className="px-3 py-1 bg-[#262626] hover:bg-[#333333] text-white border border-[#3e3e3e] rounded text-[11px] transition-colors cursor-pointer"
                >
                  {language === 'vi' ? 'Mở trang GitHub Releases' : 'Open GitHub Releases'}
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
                {language === 'vi' ? 'Không thể kiểm tra cập nhật' : 'Update Check Failed'}
              </span>
              <span className="text-[#888888] text-[11px]">
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
                  {language === 'vi' ? 'Mở GitHub' : 'Open GitHub'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-10 px-4 bg-[#202020] border-t border-[#2e2e2e] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#333333] hover:bg-[#404040] text-white font-medium rounded transition-colors cursor-pointer"
          >
            {language === 'vi' ? 'Đóng' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
