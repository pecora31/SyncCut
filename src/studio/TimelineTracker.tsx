import { clock } from "./types";

export interface TrackerClip {
  id: string;
  start: number;
  end: number;
  label: string;
  gap?: boolean;
}

export function TimelineTracker({ duration, time, fps, clips, audioLabel, audioClips, scriptClips, title, selectedId, onSeek, onSelect, importOnly = false, showVisual = true, importProgress = 0 }: {
  duration: number;
  time: number;
  fps: number;
  clips: TrackerClip[];
  audioLabel?: string;
  audioClips?: TrackerClip[];
  scriptClips?: TrackerClip[];
  title: string;
  selectedId?: string;
  onSeek: (time: number) => void;
  onSelect?: (id: string) => void;
  importOnly?: boolean;
  importProgress?: number;
  showVisual?: boolean;
}) {
  const validDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const seek = (value: number) => onSeek(Math.min(validDuration, Math.max(0, Math.round(value * fps) / fps)));
  const percent = (value: number) => `${Math.min(100, Math.max(0, value / (validDuration || 1) * 100))}%`;
  return <section className="sc-tracker" aria-label={title}>
    <div className="sc-tracker-toolbar"><strong>{title}</strong>{!importOnly && <span>{clock(time)} / {clock(validDuration)}</span>}</div>
    <div className="sc-tracker-scroll">
      <div className={`sc-tracker-content ${importOnly ? "sc-import-tracks" : ""}`} role={importOnly ? "group" : "slider"} aria-label={importOnly ? "Imported sources" : "Timeline playhead"} aria-valuemin={importOnly ? undefined : 0} aria-valuemax={importOnly ? undefined : validDuration} aria-valuenow={importOnly ? undefined : Math.min(time, validDuration)} aria-valuetext={importOnly ? undefined : clock(time)} tabIndex={!importOnly && validDuration ? 0 : -1}
        onKeyDown={(e) => {
          if (importOnly) return;
          const delta = e.shiftKey ? 1 : 1 / fps;
          if (e.key === "ArrowRight") seek(time + delta);
          else if (e.key === "ArrowLeft") seek(time - delta);
          else if (e.key === "Home") seek(0);
          else if (e.key === "End") seek(validDuration);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (importOnly || e.button !== 0 || !validDuration) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const box = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - box.left) / box.width * validDuration);
          const id = (e.target as HTMLElement).closest<HTMLElement>("[data-clip-id]")?.dataset.clipId;
          if (id) onSelect?.(id);
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const box = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - box.left) / box.width * validDuration);
        }}
        onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}>
        {showVisual && <div className="sc-tracker-lane"><span className="sc-tracker-lane-label">V1 · Image / Video</span>{clips.map((clip) => <div data-clip-id={clip.id} key={clip.id} title={importOnly ? clip.label : `${clip.label} · ${clock(clip.start)} – ${clock(clip.end)}`} className={`sc-tracker-clip ${clip.gap ? "gap" : ""} ${selectedId === clip.id ? "selected" : ""}`} style={{ left: percent(clip.start), width: percent(clip.end - clip.start) }}>{clip.label}</div>)}{!clips.length && <span className="sc-tracker-empty">{importOnly ? "No footage imported" : "No visual clips yet"}</span>}</div>}
        {(audioLabel || scriptClips !== undefined) && <div className="sc-tracker-lane audio" title={audioLabel}><span className="sc-tracker-lane-label">A1 · Audio</span>{audioLabel ? <div className="sc-tracker-audio">{audioClips?.length ? "" : audioLabel}</div> : <span className="sc-tracker-empty">Import a voiceover to hear the narration</span>}{audioLabel && audioClips?.map((segment) => <div key={segment.id} title={`${segment.label} · ${clock(segment.start)} – ${clock(segment.end)}`} className="sc-tracker-clip" style={{ left: percent(segment.start), width: percent(segment.end - segment.start) }}>{segment.label}</div>)}</div>}
        {scriptClips !== undefined && <div className="sc-tracker-lane script"><span className="sc-tracker-lane-label">S1 · Script</span>{scriptClips.map((segment) => <div key={segment.id} title={importOnly ? segment.label : `${segment.label} · ${clock(segment.start)} – ${clock(segment.end)}`} className="sc-tracker-clip" style={{ left: percent(segment.start), width: percent(segment.end - segment.start) }}>{segment.label}</div>)}{!scriptClips.length && <span className="sc-tracker-empty">{importOnly ? "No script imported" : "Aligned script appears after narration analysis"}</span>}</div>}
        <div className="sc-tracker-playhead" style={{ left: importOnly ? `${Math.min(1, Math.max(0, importProgress)) * 100}%` : percent(time) }}><span /></div>
      </div>
    </div>
    <small className="sc-tracker-help">{importOnly ? "Imported files only · Footage shares equal space here; this is not an edited sequence" : "Drag to scrub · Arrow keys move one frame · Shift + arrows move one second"}</small>
  </section>;
}
