import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FirstRunSetupModalProps {
  isOpen: boolean;
  currentFolder: string;
  onConfirm: (folder: string) => void;
}

export const FirstRunSetupModal: React.FC<FirstRunSetupModalProps> = ({
  isOpen,
  currentFolder,
  onConfirm,
}) => {
  const [selectedFolder, setSelectedFolder] = useState<string>(currentFolder || 'media_pool');

  if (!isOpen) return null;

  const handlePickFolder = async () => {
    try {
      const picked = await invoke<string | null>('pick_directory_output');
      if (picked) {
        setSelectedFolder(picked);
      }
    } catch (err) {
      console.warn('Could not pick folder:', err);
    }
  };

  const handleUseDefault = () => {
    setSelectedFolder('media_pool');
  };

  const handleDone = () => {
    onConfirm(selectedFolder || 'media_pool');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 select-none">
      <div className="w-full max-w-md bg-[#1c1c1c] border border-[#3e3e3e] rounded-lg shadow-2xl p-5 flex flex-col gap-4 text-xs font-mono">
        {/* Header */}
        <div className="flex flex-col gap-1 border-b border-[#2d2d2d] pb-3">
          <span className="text-white font-semibold text-sm">Media Pool Setup</span>
          <span className="text-[#888888] text-[11px] leading-relaxed">
            Select a dedicated default folder to store your project videos, voiceovers, and downloaded footage.
          </span>
        </div>

        {/* Folder Preview Box */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-[#777777] uppercase font-bold">Selected Folder</span>
          <div className="p-2.5 bg-[#121212] border border-[#333333] rounded flex items-center justify-between gap-2">
            <span className="text-white truncate flex-1 font-mono text-[11px]" title={selectedFolder}>
              {selectedFolder}
            </span>
            {selectedFolder !== 'media_pool' && (
              <button
                type="button"
                onClick={handleUseDefault}
                className="text-[10px] text-[#888888] hover:text-white transition-colors cursor-pointer shrink-0"
              >
                Reset Default
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={handlePickFolder}
            className="w-full py-2 bg-[#252525] hover:bg-[#303030] text-[#cccccc] hover:text-white border border-[#383838] rounded transition-colors cursor-pointer text-center font-medium"
          >
            Browse Folder...
          </button>

          <button
            type="button"
            onClick={handleDone}
            className="w-full py-2 bg-[#333333] hover:bg-[#444444] text-white border border-[#555555] rounded font-semibold transition-colors cursor-pointer text-center"
          >
            Confirm & Start
          </button>
        </div>
      </div>
    </div>
  );
};
