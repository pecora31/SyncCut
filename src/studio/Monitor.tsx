import { useCallback, useEffect, useRef, useState } from "react";
import { safeConvertFileSrc } from "../utils/mediaUtils";
import { Asset, clock, fpsOf, Project } from "./types";

interface Props {
  project: Project;
  source: Asset | null;
  sourceStart: number;
  onCloseSource: () => void;
  time: number;
  onTime: (time: number) => void;
  seekRequest: number;
}
export function Monitor({
  project,
  source,
  sourceStart,
  onCloseSource,
  time,
  onTime,
  seekRequest,
}: Props) {
  const [mode, setMode] = useState<"source" | "program">("program");
  const [playing, setPlaying] = useState(false);
  const [sourceTime, setSourceTime] = useState(0);
  const [sourceDuration, setSourceDuration] = useState(0);
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
      : project.assets.find((a) => a.id === clip?.assetId);
  const path = asset?.path;
  const duration = mode === "source" ? sourceDuration : project.duration;
  const cursor = mode === "source" ? sourceTime : time;
  useEffect(() => {
    if (source) {
      setMode("source");
      setPlaying(false);
      setSourceTime(sourceStart);
      setSourceDuration(source.duration || 0);
    } else setMode("program");
  }, [source, sourceStart]);
  useEffect(() => {
    if (mode !== "source") return;
    const media =
      source?.kind === "voice" ? sourceAudioRef.current : videoRef.current;
    if (media && media.readyState >= 1) media.currentTime = sourceStart;
  }, [source, sourceStart, mode]);
  useEffect(() => {
    setPlaying(false);
    setMode("program");
    setError("");
  }, [project.id, project.clips]);
  useEffect(() => setError(""), [path, mode]);
  useEffect(() => {
    if (mode === "program" && voiceRef.current)
      voiceRef.current.currentTime = Math.min(
        timeRef.current,
        project.duration || timeRef.current,
      );
  }, [seekRequest, mode, project.duration]);
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
    const master =
      mode === "program"
        ? voiceRef.current
        : asset?.kind === "voice"
          ? sourceAudioRef.current
          : videoRef.current;
    if (voiceRef.current && mode !== "program") voiceRef.current.pause();
    if (!master) return;
    master.volume = volume;
    if (playing)
      master.play().catch((e) => {
        setError(`Playback unavailable: ${String(e)}`);
        setPlaying(false);
      });
    else master.pause();
    if (mode === "program" && videoRef.current) {
      videoRef.current.muted = true;
      if (playing) syncVideo();
      else videoRef.current.pause();
    }
  }, [playing, mode, path, volume, asset?.kind, syncVideo]);
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
  function switchMode(next: "source" | "program") {
    setPlaying(false);
    setMode(next);
  }
  const canPlay =
    mode === "program"
      ? !!voice
      : !!asset && asset.kind !== "image" && asset.kind !== "script";
  const beat = project.beats.find(
    (b) =>
      b.status !== "excluded" &&
      b.start !== null &&
      b.end !== null &&
      b.start <= time &&
      time < b.end,
  );
  return (
    <div className="sc-monitor">
      <div className="sc-panel-head">
        <div className="sc-tabs">
          <button
            className={mode === "program" ? "active" : ""}
            onClick={() => switchMode("program")}
          >
            Program
          </button>
          <button
            disabled={!source}
            className={mode === "source" ? "active" : ""}
            onClick={() => switchMode("source")}
          >
            Source
          </button>
        </div>
        {source && (
          <button
            className="sc-text-button"
            onClick={() => {
              onCloseSource();
              switchMode("program");
            }}
          >
            Close source
          </button>
        )}
      </div>
      <div className="sc-screen">
        {asset?.kind === "image" ? (
          <img src={safeConvertFileSrc(asset.path)} alt={asset.name} />
        ) : asset?.kind === "video" ? (
          <video
            key={`${mode}:${path}`}
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
          onLoadedMetadata={(e) => setSourceDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setSourceTime(e.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
        />
      )}
      <div className="sc-transport">
        <button
          disabled={!canPlay}
          onClick={() => {
            if (cursor >= duration - 0.05) seek(0);
            setPlaying((v) => !v);
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="sc-mono">{clock(cursor)}</span>
        <input
          aria-label="Playback position"
          type="range"
          min="0"
          max={duration || 1}
          step={1 / fps}
          value={Math.min(cursor, duration || 1)}
          disabled={!duration}
          onChange={(e) => seek(Number(e.target.value))}
        />
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
      {mode === "program" && beat && (
        <div className="sc-caption">{beat.text}</div>
      )}
    </div>
  );
}
