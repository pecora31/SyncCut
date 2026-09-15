export interface Settings {
  profile: "quality" | "fast";
  resource: "focused" | "shared";
  fpsNum: number;
  fpsDen: number;
  width: number;
  height: number;
  shotSeconds: number;
  topK: number;
  rerankK: number;
}
export interface Asset {
  id: string;
  name: string;
  path: string;
  kind: "voice" | "script" | "video" | "image";
  sizeBytes: number;
  duration: number | null;
  fingerprint?: string | null;
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  hasAudio: boolean;
  hasVideo: boolean;
  channels: number;
  sampleRate: number;
  codec: string;
}
export interface Word {
  text: string;
  start: number;
  end: number;
  aligned: boolean;
  asrScore?: number;
  alignmentScore?: number;
}
export interface Beat {
  id: string;
  script: string;
  spoken: string;
  text: string;
  start: number | null;
  end: number | null;
  status: "verified" | "review" | "accepted" | "excluded";
  issue: string;
}
export interface Shot {
  id: string;
  assetId: string;
  sourceIn: number;
  sourceOut: number;
  keyframes: { path: string; time: number }[];
  caption: string;
}
export interface Candidate {
  shotId: string;
  similarity: number;
  verdict: "match" | "partial" | "unrelated" | "unreviewed";
  reason: string;
  evidenceTimes: number[];
}
export interface Match {
  beatId: string;
  visualBrief: string;
  candidates: Candidate[];
}
export interface Clip {
  id: string;
  beatId: string | null;
  assetId: string | null;
  shotId: string | null;
  start: number;
  end: number;
  sourceIn: number;
  sourceOut: number;
  state: "suggested" | "accepted" | "gap";
  locked: boolean;
  reason: string;
}
export interface Project {
  schemaVersion: 2;
  id: string;
  root: string;
  name: string;
  revision: number;
  assets: Asset[];
  voiceId: string | null;
  scriptId: string | null;
  visualIds: string[];
  settings: Settings;
  duration: number;
  words: Word[];
  beats: Beat[];
  shots: Shot[];
  matches: Match[];
  clips: Clip[];
  provenance: unknown;
  exportPath: string | null;
}
export interface Job {
  id: string;
  root: string;
  stage: "speech" | "match" | "export";
  status:
    | "running"
    | "paused"
    | "cancelled"
    | "interrupted"
    | "completed"
    | "failed";
  message: string;
  done: number;
  total: number;
  pid: number;
  revision: number;
  logPath: string;
  exportDir: string | null;
  allowGaps: boolean;
}
export interface Runtime {
  root: string;
  pythonPath: string;
  pythonReady: boolean;
  binariesReady: boolean;
  modelDir: string;
  binDir: string;
  engineDir: string;
  models: { key: string; name: string; ready: boolean }[];
}
export interface RuntimePrerequisites {
  pythonReady: boolean;
  pythonPath: string;
  mediaReady: boolean;
  mediaPath: string;
  gpuReady: boolean;
  gpuDescription: string;
  installRoot: string;
  defaultModelRoot: string;
  modelRoot: string;
}
export interface RuntimeSetup {
  status: "running" | "completed" | "failed" | "cancelled";
  message: string;
  profile: "fast" | "quality";
  pid: number;
  logPath: string;
  stage: string;
  currentItem: string;
  modelKey: string;
  downloadedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  remainingBytes: number;
  installRoot: string;
  modelRoot: string;
}
export const fpsOf = (p: Project) => p.settings.fpsNum / p.settings.fpsDen;
export function clock(s: number) {
  const v = Math.max(0, s || 0);
  return `${Math.floor(v / 60)
    .toString()
    .padStart(2, "0")}:${(v % 60).toFixed(2).padStart(5, "0")}`;
}
