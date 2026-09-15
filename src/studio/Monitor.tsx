import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { safeConvertFileSrc } from "../utils/mediaUtils";
import { Asset, clock, fpsOf, Project } from "./types";
import { TimelineTracker } from "./TimelineTracker";

interface Props {
  onSourcePointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  step: number;
  project: Project;
  source: Asset | null;
  sourceStart: number;
  onCloseSource: () => void;
  time: number;
  onTime: (time: number) => void;
  seekRequest: number;
  selectedClipId?: string;
  onSelectClip?: (id: string) => void;
}
export function Monitor({
  onSourcePointerDown,
  step,
  project,
  source,
  sourceStart,
  onCloseSource,
  time,
  onTime,
  seekRequest,
  selectedClipId,
  onSelectClip,
}: Props) {
  const mode = step === 0 ? "source" : "program";
  const narrationOnly = step === 1;
  const [playing, setPlaying] = useState(false);
  const [sourceTime, setSourceTime] = useState(0);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [voiceMetadata, setVoiceMetadata] = useState({ path: "", duration: 0 });
  const [error, setError] = useState("");
  const [volume, setVolume] = useState(0.8);
  const voiceRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceAudioRef = useRef<HTMLAudioElement>(null);
  const timeRef = useRef(time);
  timeRef.current = time;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const fps = fpsOf(project);
  const voice = project.assets.find((a) => a.id === project.voiceId);
  const frame = Math.floor(time * fps + 1e-5);
  const clip = project.clips.find((c) => c.start <= frame && frame < c.end);
  const asset =
    mode === "source"
      ? source
      : narrationOnly ? undefined : project.assets.find((a) => a.id === clip?.assetId);
  const path = asset?.path;
  const voiceDuration = voiceMetadata.path === voice?.path ? voiceMetadata.duration : 0;
  const programDuration = Math.max(voiceDuration, voice?.duration || 0, project.duration || 0);
  const duration = mode === "source" ? sourceDuration : programDuration;
  const cursor = mode === "source" ? sourceTime : time;
  useEffect(() => {
    if (mode === "source") {
      setPlaying(false);
      setSourceTime(sourceStart);
      setSourceDuration(source?.duration || 0);
    }
  }, [source?.id, source?.path, sourceStart, mode]);
  useEffect(() => {
    if (mode !== "source") return;
    const media =
      source?.kind === "voice" ? sourceAudioRef.current : videoRef.current;
    if (media && media.readyState >= 1) media.currentTime = sourceStart;
  }, [source?.id, source?.path, source?.kind, sourceStart, mode]);
  useEffect(() => {
    setPlaying(false);
    setError("");
  }, [project.id]);
  useEffect(() => { setPlaying(false); setError(""); }, [step]);
  useEffect(() => setError(""), [path, mode]);
  useEffect(() => {
    if (mode === "program" && voiceRef.current)
      voiceRef.current.currentTime = Math.min(
        timeRef.current,
        programDuration || timeRef.current,
      );
  }, [seekRequest, mode, programDuration]);
  const syncVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || mode !== "program" || !clip) return;
    const expected =
      clip.sourceIn + Math.max(0, timeRef.current - clip.start / fps);
    if (
      video.readyState >= 1 &&
      Math.abs(video.currentTime - expected) > Math.max(0.045, 1 / fps)
    )
      video.currentTime = expected;
    video.muted = true;
    if (playingRef.current && video.paused)
      video.play().catch((e) => setError(String(e)));
  }, [mode, clip, fps]);
  useEffect(() => syncVideo(), [time, path, syncVideo]);
  useEffect(() => {
    let cancelled = false;
    const master =
      mode === "program"
        ? voiceRef.current
        : asset?.kind === "voice"
          ? sourceAudioRef.current
          : videoRef.current;
    if (voiceRef.current && mode !== "program") voiceRef.current.pause();
    if (!master) return;
    master.volume = volume;
    if (playing && master.paused)
      master.play().catch((e) => {
        if (cancelled) return;
        setError(`Playback unavailable: ${String(e)}`);
        setPlaying(false);
      });
    else if (!playing) master.pause();
    return () => { cancelled = true; };
  }, [playing, mode, path, voice?.path, volume, asset?.kind]);
  useEffect(() => {
    if (mode === "program" && videoRef.current) {
      videoRef.current.muted = true;
      if (playing) syncVideo();
      else videoRef.current.pause();
    }
  }, [playing, mode, path, syncVideo]);
  useEffect(() => {
    if (!playing || mode !== "program") return;
    let animation = 0;
    const tick = () => {
      const a = voiceRef.current;
      if (a && !a.paused) onTime(a.currentTime);
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, mode, onTime]);
  function seek(value: number) {
    if (mode === "program") {
      if (voiceRef.current) voiceRef.current.currentTime = value;
      onTime(value);
    } else {
      const a = sourceAudioRef.current || videoRef.current;
      if (a) a.currentTime = value;
      setSourceTime(value);
    }
  }
  const canPlay =
    mode === "program"
      ? !!voice && (!narrationOnly || project.beats.some((b) => b.status !== "excluded" && b.start !== null && b.end !== null))
      : !!asset && asset.kind !== "image" && asset.kind !== "script";
  const beat = project.beats.find(
    (b) =>
      b.status !== "excluded" &&
      b.start !== null &&
      b.end !== null &&
      b.start <= time &&
      time < b.end,
  );
  const visuals = project.assets.filter((a) => project.visualIds.includes(a.id));
  const sourceProgress = sourceDuration > 0 ? Math.min(1, Math.max(0, sourceTime / sourceDuration)) : 0;
  const sourceVisualIndex = visuals.findIndex((a) => a.id === source?.id);
  const importProgress = !source ? 0 : sourceVisualIndex >= 0
    ? (sourceVisualIndex + sourceProgress) / visuals.length
    : sourceProgress;
  const script = project.assets.find((a) => a.id === project.scriptId);
  const scriptSegments = project.beats
    .filter((b) => b.status !== "excluded" && b.start !== null && b.end !== null && b.end > b.start)
    .map((b) => ({ id: b.id, start: b.start!, end: b.end!, label: b.text }));
  return (
    <div className="sc-monitor">
      <div className="sc-panel-head">
        <strong>{step === 0 ? "Source preview" : step === 1 ? "Narration & script preview" : "Assembled sequence preview"}</strong>
        {step === 0 && source && <button className="sc-text-button" onClick={() => { setPlaying(false); onCloseSource(); }}>Close source</button>}
      </div>
      <div className={`sc-screen ${step === 0 && asset && (asset.kind === "video" || asset.kind === "image") ? "sc-draggable-preview" : ""}`} onPointerDown={step === 0 ? onSourcePointerDown : undefined}>
        {narrationOnly ? (
          <div className="sc-screen-message sc-narration-preview">
            <span className="sc-eyebrow">VOICEOVER & SCRIPT</span>
            <p aria-live={playing ? "off" : "polite"}>{beat?.text || (scriptSegments.length ? "Play to follow the aligned script with your voiceover." : "Analyze narration in step 1 to preview the aligned script.")}</p>
            <small>{voice?.name || "No voiceover imported"}</small>
          </div>
        ) : asset?.kind === "image" ? (
          <img src={safeConvertFileSrc(asset.path)} alt={asset.name} />
        ) : asset?.kind === "video" ? (
          <video
            key={path}
            ref={videoRef}
            src={safeConvertFileSrc(asset.path)}
            playsInline
            preload="auto"
            muted={mode === "program"}
            onLoadedMetadata={(e) => {
              if (mode === "source") {
                setSourceDuration(e.currentTarget.duration);
                e.currentTarget.currentTime = sourceStart;
              } else syncVideo();
            }}
            onCanPlay={syncVideo}
            onTimeUpdate={(e) => {
              if (mode === "source") setSourceTime(e.currentTarget.currentTime);
            }}
            onEnded={() => {
              if (mode === "source") setPlaying(false);
            }}
            onError={() =>
              setError(
                "This source codec cannot be previewed here. Exported editing media is conformed to H.264.",
              )
            }
          />
        ) : (
          <div className="sc-screen-message">
            <span className="sc-eyebrow">
              {mode === "source"
                ? "SOURCE"
                : clip?.state === "gap"
                  ? "TIMELINE GAP"
                  : "PROGRAM MONITOR"}
            </span>
            <p>
              {mode === "source"
                ? asset?.name || "Double-click a source to preview it."
                : clip?.state === "gap"
                  ? clip.reason
                  : beat?.spoken || "Your assembled sequence will appear here."}
            </p>
          </div>
        )}
        {error && <div className="sc-preview-error">{error}</div>}
        {asset && <span className="sc-media-label">{asset.name}</span>}
      </div>
      <audio
        ref={voiceRef}
        src={voice ? safeConvertFileSrc(voice.path) : undefined}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const mediaDuration = e.currentTarget.duration;
          setVoiceMetadata({ path: voice?.path || "", duration: Number.isFinite(mediaDuration) ? mediaDuration : 0 });
          e.currentTarget.currentTime = Math.min(
            timeRef.current,
            e.currentTarget.duration || 0,
          );
        }}
        onEnded={() => setPlaying(false)}
        onError={() =>
          setError(
            "Cannot load the voiceover. Check the source path and codec.",
          )
        }
      />
      {mode === "source" && asset?.kind === "voice" && (
        <audio
          ref={sourceAudioRef}
          src={safeConvertFileSrc(asset.path)}
          preload="metadata"
          onLoadedMetadata={(e) => { setSourceDuration(e.currentTarget.duration); e.currentTarget.currentTime = sourceStart; }}
          onTimeUpdate={(e) => setSourceTime(e.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
        />
      )}
      <div className="sc-transport">
        <button
          disabled={!canPlay}
          onClick={() => {
            if (!playing && duration > 0 && cursor >= duration - 0.05) seek(0);
            setPlaying((v) => !v);
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="sc-mono">{clock(cursor)}</span>
        {step === 0 ? <input aria-label="Source playback position" type="range" min={0} max={duration || 1} step={1 / fps} value={Math.min(cursor, duration || 0)} disabled={!canPlay || !duration} onChange={(e) => seek(Number(e.target.value))} /> : <span className="sc-transport-spacer" />}
        <span className="sc-mono sc-muted">{clock(duration)}</span>
        <input
          className="sc-volume"
          aria-label="Volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
      <TimelineTracker title={step === 0 ? "Imported sources" : narrationOnly ? "Aligned narration" : "Assembled timeline"} duration={step === 0 ? 1 : duration} time={step === 0 ? 0 : cursor} fps={fps} onSeek={seek} importOnly={step === 0} importProgress={importProgress} showVisual={!narrationOnly} selectedId={step >= 2 ? selectedClipId : undefined} onSelect={step >= 2 ? onSelectClip : undefined}
        clips={step === 0 ? visuals.map((a, i) => ({ id: a.id, start: i / visuals.length, end: (i + 1) / visuals.length, label: a.name })) : project.clips.map((c) => ({ id: c.id, start: c.start / fps, end: c.end / fps, label: project.assets.find((a) => a.id === c.assetId)?.name ?? "Empty visual", gap: c.state === "gap" }))}
        audioLabel={voice?.name}
        audioClips={step === 0 ? undefined : project.beats.filter((b) => b.status !== "excluded" && b.start !== null && b.end !== null && b.end > b.start).map((b) => ({ id: b.id, start: b.start!, end: b.end!, label: b.spoken || b.text }))}
        scriptClips={step === 0 ? script ? [{ id: script.id, start: 0, end: 1, label: script.name }] : [] : scriptSegments} />
      {mode === "program" && !narrationOnly && beat && (
        <div className="sc-caption">{beat.text}</div>
      )}
    </div>
  );
}
