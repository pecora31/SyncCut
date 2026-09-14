export interface ProjectConfig {
  voicePath: string;
  scriptPath: string;
  outputDir: string;
  youtubeUrls: string[];
  imagesDir?: string;
}

export interface SentenceSegment {
  id: number;
  text: string;
  startTime: number;
  endTime: number;
  duration: number;
  assetType: 'video' | 'image';
  sourceMediaName: string;
  sourceMediaPath: string;
  sourceIn: number;
  sourceOut: number;
  matchConfidence?: number;
}

export interface MediaAsset {
  id: string;
  name: string;
  path: string;
  fileType: 'voice' | 'script' | 'video' | 'image';
  sizeBytes: number;
  duration?: number;
}

export interface InterleavingSettings {
  videoRatio: number; // 0 to 100
  pattern: 'alternate' | 'ratio' | 'random';
  minSceneDuration: number;
  maxSceneDuration: number;
  fps: number;
}

export interface ProcessingLog {
  timestamp: string;
  stage: 'idle' | 'downloading' | 'aligning' | 'slicing' | 'exporting' | 'completed' | 'error';
  message: string;
  progress?: number;
}
