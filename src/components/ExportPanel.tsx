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
    <div className="flex flex-col gap-4 p-4 bg-[#141418] border border-[#24242c] rounded-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#22222a]">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
          4. Execution & Export Terminal
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!canProcess || isProcessing}
          onClick={onProcessAndExport}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-[#1e1e28] disabled:text-zinc-600 text-white text-xs font-mono font-semibold uppercase tracking-wider rounded border border-indigo-500/30 transition-all shadow-sm"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-indigo-200" />
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
            className="flex items-center gap-2 py-2.5 px-4 bg-[#1b1b24] hover:bg-[#242430] border border-[#323242] text-zinc-200 text-xs font-mono rounded transition-colors"
          >
            <FolderOpen className="w-4 h-4 text-emerald-400" />
            <span>Open XML Folder</span>
          </button>
        )}
      </div>

      {/* Console Log Terminal */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <span>Live Console Log</span>
          <span>{logs.length} messages</span>
        </div>
        <div className="h-32 bg-[#0d0d10] border border-[#202026] rounded p-2.5 overflow-y-auto font-mono text-[11px] flex flex-col gap-1">
          {logs.length === 0 ? (
            <span className="text-zinc-600 italic">Ready. Awaiting input to start pipeline...</span>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex items-start gap-2 leading-relaxed">
                <span className="text-zinc-600 shrink-0">[{log.timestamp}]</span>
                <span
                  className={
                    log.stage === 'error'
                      ? 'text-rose-400'
                      : log.stage === 'completed'
                      ? 'text-emerald-400'
                      : log.stage === 'downloading' || log.stage === 'aligning' || log.stage === 'slicing' || log.stage === 'exporting'
                      ? 'text-amber-400'
                      : 'text-zinc-300'
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
