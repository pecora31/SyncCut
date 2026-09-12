import React from 'react';
import { Play, Loader2, FolderOpen, Terminal } from 'lucide-react';
import { ProcessingLog } from '../types';

interface ExportPanelProps {
  onProcessAndExport: () => void;
  onOpenFolder?: () => void;
  isProcessing: boolean;
  canProcess: boolean;
  logs: ProcessingLog[];
  status: 'idle' | 'processing' | 'ready' | 'completed' | 'error';
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  onProcessAndExport,
  onOpenFolder,
  isProcessing,
  canProcess,
  logs,
  status,
}) => {
  return (
    <div className="flex flex-col gap-4 p-4 bg-[#161b22] border border-[#30363d] rounded-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#21262d]">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#c9d1d9] flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#58a6ff]" />
          4. Execution & Export Terminal
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!canProcess || isProcessing}
          onClick={onProcessAndExport}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#6e7681] text-white text-xs font-sans font-semibold rounded-md border border-[rgba(240,246,252,0.1)] transition-all shadow-sm"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white/80" />
              <span>Processing Pipeline...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Align, Slice & Export Premiere XML</span>
            </>
          )}
        </button>

        {status === 'completed' && onOpenFolder && (
          <button
            type="button"
            onClick={onOpenFolder}
            className="flex items-center gap-2 py-2.5 px-4 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] text-xs font-sans rounded-md transition-colors"
          >
            <FolderOpen className="w-4 h-4 text-[#3fb950]" />
            <span>Open XML Folder</span>
          </button>
        )}
      </div>

      {/* Console Log Terminal */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#8b949e]">
          <span>Live Console Log</span>
          <span>{logs.length} messages</span>
        </div>
        <div className="h-32 bg-[#0d1117] border border-[#30363d] rounded-md p-2.5 overflow-y-auto font-mono text-[11px] flex flex-col gap-1">
          {logs.length === 0 ? (
            <span className="text-[#6e7681] italic">Ready. Awaiting input to start pipeline...</span>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex items-start gap-2 leading-relaxed">
                <span className="text-[#6e7681] shrink-0">[{log.timestamp}]</span>
                <span
                  className={
                    log.stage === 'error'
                      ? 'text-[#f85149]'
                      : log.stage === 'completed'
                      ? 'text-[#3fb950]'
                      : log.stage === 'downloading' || log.stage === 'aligning' || log.stage === 'slicing' || log.stage === 'exporting'
                      ? 'text-[#e3b341]'
                      : 'text-[#c9d1d9]'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
