import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'en' | 'vi';

export interface Translations {
  // Header
  appSubtitle: string;
  exportXml: string;
  exporting: string;

  // Tabs
  mediaPool: string;
  aiMatcher: string;
  aiSettings: string;
  matchedScenes: string;
  autoSaved: string;
  settingsGuide: string;
  hideGuide: string;
  resetDefaults: string;

  // Guide Panel
  guideTitle: string;
  close: string;
  guideTabGeneral: string;
  guideTabAdvanced: string;
  guideProfileTitle: string;
  guideProfileDesc: string;
  guideProfileDraft: string;
  guideProfileBalanced: string;
  guideProfileQuality: string;
  guidePacingTitle: string;
  guidePacingDesc: string;
  guidePacingFast: string;
  guidePacingBalanced: string;
  guidePacingCinematic: string;
  guideCoverageTitle: string;
  guideCoverageFill: string;
  guideCoverageStrict: string;
  guideFormatTitle: string;
  guideFormatDesc: string;
  guideWhisperTitle: string;
  guideWhisperBase: string;
  guideWhisperLarge: string;
  guideAlignmentTitle: string;
  guideAlignmentForced: string;
  guideAlignmentProportional: string;
  guideVadDesc: string;
  guideVisionTitle: string;
  guideVisionClip: string;
  guideVisionSiglip: string;
  guideMinShotDesc: string;
  guideConfidenceDesc: string;
  guideSequenceTitle: string;
  guideFramerateDesc: string;
  guideXmlDesc: string;

  // Resource Bar
  activeVoice: string;
  script: string;
  footage: string;
  clips: string;
  none: string;

  // General Settings
  generalSettings: string;
  generalSubtitle: string;
  processingProfile: string;
  profileSubtitle: string;
  fastDraft: string;
  balanced: string;
  highAccuracy: string;
  custom: string;
  videoCutPacing: string;
  pacingSubtitle: string;
  fastCuts: string;
  cinematic: string;
  narrationLanguage: string;
  narrationSubtitle: string;
  autoDetect: string;
  targetFormat: string;
  formatSubtitle: string;
  footageCoverage: string;
  coverageSubtitle: string;
  fillEntireVoice: string;
  matchKeySentences: string;

  // Advanced Settings
  advancedSettings: string;
  advancedSubtitle: string;
  showAdvanced: string;
  hideAdvanced: string;
  minShotDuration: string;
  minShotSubtitle: string;
  confidenceFilter: string;
  confidenceSubtitle: string;
  loose: string;
  standard: string;
  strict: string;
  speechAlignmentEngine: string;
  whisperModel: string;
  alignmentMode: string;
  forcedWordAlignment: string;
  proportionalFallback: string;
  vadFilter: string;
  enabled: string;
  disabled: string;
  visionModelEngine: string;
  visionModel: string;
  sequenceExportProtocol: string;
  sequenceFramerate: string;
  xmlExportProtocol: string;

  // Scenes List
  noScenesAligned: string;
  noScenesPrompt: string;
  scene: string;
  match: string;
  matched: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    appSubtitle: 'Adobe Premiere Pro Workspace',
    exportXml: 'EXPORT XML',
    exporting: 'Exporting...',

    mediaPool: 'Media Pool',
    aiMatcher: 'AI Config',
    aiSettings: 'AI Settings',
    matchedScenes: 'Matched Scenes',
    autoSaved: 'Auto-saved',
    settingsGuide: 'Settings Guide',
    hideGuide: 'Hide Guide',
    resetDefaults: 'Reset Defaults',

    guideTitle: 'Settings Quick Guide',
    close: 'Close',
    guideTabGeneral: 'General Settings',
    guideTabAdvanced: 'Advanced Settings',
    guideProfileTitle: 'Processing Profile',
    guideProfileDesc: 'Controls AI depth and processing speed:',
    guideProfileDraft: 'Fast Draft: Quickest preview for fast rough cuts.',
    guideProfileBalanced: 'Balanced: Recommended for everyday YouTube videos and vlogs.',
    guideProfileQuality: 'High Accuracy: Deep semantic analysis for polished master edits.',
    guidePacingTitle: 'Video Cut Pacing',
    guidePacingDesc: 'Average duration before switching to a new B-Roll footage clip:',
    guidePacingFast: '1.5s - 3.0s: Fast, high-energy cuts for TikTok, Shorts, and Reels.',
    guidePacingBalanced: '3.5s - 6.0s: Standard pace for explanatory & YouTube videos.',
    guidePacingCinematic: '6.5s - 10.0s: Slow, cinematic documentary pacing.',
    guideCoverageTitle: 'Footage Coverage',
    guideCoverageFill: 'Fill All: Ensures continuous footage throughout with zero blank spaces.',
    guideCoverageStrict: 'Key Sentences Only: Only cuts to B-Roll when confidence is high, leaving main speaker view.',
    guideFormatTitle: 'Target Video Format',
    guideFormatDesc: 'Sequence canvas resolution: 1080p (Standard HD), 9:16 (Vertical Shorts), 4K (Ultra HD).',

    // Advanced Guide
    guideWhisperTitle: 'Speech & Transcription (Whisper AI)',
    guideWhisperBase: 'Whisper Base/Small: Fast processing with minimal CPU load, ideal for clear studio narration.',
    guideWhisperLarge: 'Whisper Medium/Large-v3: Maximum accuracy for accents, technical terminology, or noisy audio.',
    guideAlignmentTitle: 'Forced Alignment & VAD Filter',
    guideAlignmentForced: 'Forced Word Alignment: Snaps timestamps directly to acoustic speech syllables at millisecond accuracy.',
    guideAlignmentProportional: 'Proportional Fallback: Evenly distributes words across clip duration if audio waveform is degraded.',
    guideVadDesc: 'Voice Activity Detection (VAD): Automatically isolates silence and breaths so footage cuts only during real speech.',
    guideVisionTitle: 'Visual AI Models & Thresholds (CLIP)',
    guideVisionClip: 'CLIP ViT-B/32 vs ViT-L/14: Scans video frames for semantic objects, actions, and mood matching script words.',
    guideVisionSiglip: 'SigLIP: Deep vision-language model with enhanced semantic precision for nuanced storytelling.',
    guideMinShotDesc: 'Min Shot Duration: Enforces shortest permissible shot length to prevent jarring, rapid flickering cuts.',
    guideConfidenceDesc: 'Confidence Filter: Strictness threshold (50% = flexible, 80% = balanced, 95% = strict exact match).',
    guideSequenceTitle: 'Sequence Specs & Export Protocols',
    guideFramerateDesc: 'Framerate: 24 fps (Cinematic), 25 fps (Broadcast/PAL), 30 fps (Web/YouTube), 60 fps (Ultra smooth).',
    guideXmlDesc: 'XML Export: Generates Final Cut Pro 7 / Premiere XML with synced video and audio tracks ready to edit.',

    activeVoice: 'Voiceover',
    script: 'Script',
    footage: 'Footage',
    clips: 'clips',
    none: 'None',

    generalSettings: 'General Settings',
    generalSubtitle: 'Primary timeline and AI alignment preferences',
    processingProfile: 'Processing Profile',
    profileSubtitle: 'Balance between speed and alignment accuracy',
    fastDraft: 'Fast Draft',
    balanced: 'Balanced',
    highAccuracy: 'High Accuracy',
    custom: 'Custom',
    videoCutPacing: 'Video Cut Pacing',
    pacingSubtitle: 'Average duration of each B-Roll scene',
    fastCuts: 'Fast Paced',
    cinematic: 'Cinematic',
    narrationLanguage: 'Narration Language',
    narrationSubtitle: 'Language spoken in voiceover',
    autoDetect: 'Auto-Detect',
    targetFormat: 'Target Video Format',
    formatSubtitle: 'Aspect ratio and sequence size',
    footageCoverage: 'Footage Coverage',
    coverageSubtitle: 'How footage fills gaps across narration sentences',
    fillEntireVoice: 'Fill All',
    matchKeySentences: 'Key Sentences Only',

    advancedSettings: 'Advanced Settings',
    advancedSubtitle: 'Low-level AI model parameters and sequence protocols',
    showAdvanced: 'Show Advanced',
    hideAdvanced: 'Hide Advanced',
    minShotDuration: 'Min Shot Duration',
    minShotSubtitle: 'Prevents rapid flickering',
    confidenceFilter: 'Confidence Filter',
    confidenceSubtitle: 'Semantic match threshold',
    loose: 'Loose',
    standard: 'Standard',
    strict: 'Strict',
    speechAlignmentEngine: 'Speech & Alignment Engine',
    whisperModel: 'Whisper Model',
    alignmentMode: 'Alignment Mode',
    forcedWordAlignment: 'Forced Word Alignment',
    proportionalFallback: 'Proportional Fallback',
    vadFilter: 'Voice Activity Detection (VAD)',
    enabled: 'Enabled',
    disabled: 'Disabled',
    visionModelEngine: 'Vision Model Engine',
    visionModel: 'Vision Model',
    sequenceExportProtocol: 'Sequence & Export Protocol',
    sequenceFramerate: 'Sequence Framerate',
    xmlExportProtocol: 'XML Export Protocol',

    noScenesAligned: 'No scenes aligned yet',
    noScenesPrompt: 'Configure AI settings in the tab above, then click START ANALYSIS in the pipeline dock.',
    scene: 'Scene',
    match: 'Match',
    matched: 'Matched',
  },
  vi: {
    appSubtitle: 'Không gian làm việc Adobe Premiere Pro',
    exportXml: 'XUẤT XML',
    exporting: 'Đang xuất XML...',

    mediaPool: 'Kho Media',
    aiMatcher: 'Cấu hình AI',
    aiSettings: 'Cài đặt AI',
    matchedScenes: 'Cảnh đã khớp',
    autoSaved: 'Đã tự lưu',
    settingsGuide: 'Hướng dẫn cài đặt',
    hideGuide: 'Đóng hướng dẫn',
    resetDefaults: 'Đặt lại mặc định',

    guideTitle: 'Hướng dẫn nhanh các thông số AI',
    close: 'Đóng',
    guideTabGeneral: 'Cài đặt phổ thông',
    guideTabAdvanced: 'Cài đặt nâng cao',
    guideProfileTitle: 'Cấu hình xử lý (Profile)',
    guideProfileDesc: 'Kiểm soát mức độ phân tích sâu và tốc độ xử lý:',
    guideProfileDraft: 'Bản nháp nhanh: Xử lý nhanh nhất để xem thử bố cục sơ bộ.',
    guideProfileBalanced: 'Cân bằng: Tối ưu cho hầu hết video YouTube, vlog thường ngày.',
    guideProfileQuality: 'Độ chính xác cao: Quét ngữ nghĩa chuyên sâu cho bản xuất chính thức.',
    guidePacingTitle: 'Nhịp điệu cắt cảnh (Cut Pacing)',
    guidePacingDesc: 'Thời lượng trung bình của một cảnh B-Roll trước khi chuyển shot:',
    guidePacingFast: '1.5s - 3.0s: Cắt nhanh dồn dập cho TikTok, Shorts, Reels.',
    guidePacingBalanced: '3.5s - 6.0s: Nhịp tiêu chuẩn tự nhiên cho video giải thích, YouTube.',
    guidePacingCinematic: '6.5s - 10.0s: Nhịp chậm, sâu lắng cho phim tài liệu, phong cảnh.',
    guideCoverageTitle: 'Độ phủ của Footage',
    guideCoverageFill: 'Phủ kín toàn bộ: Đảm bảo có video xuyên suốt lời thoại, không bị khoảng đen.',
    guideCoverageStrict: 'Chỉ câu chính: Chỉ chèn B-Roll khi độ tương quan hình ảnh cao.',
    guideFormatTitle: 'Định dạng video đích',
    guideFormatDesc: 'Độ phân giải khung hình: 1080p (Full HD ngang), 9:16 (Dọc Shorts/TikTok), 4K (Ultra HD siêu nét).',

    // Advanced Guide
    guideWhisperTitle: 'Mô hình nhận diện giọng đọc (Whisper AI)',
    guideWhisperBase: 'Whisper Base/Small: Tốc độ xử lý siêu tốc, tốn ít CPU, phù hợp giọng đọc phòng thu rõ tiếng.',
    guideWhisperLarge: 'Whisper Medium/Large-v3: Nhận diện chính xác tối đa khi có giọng vùng miền, từ ngữ chuyên ngành hoặc tạp âm.',
    guideAlignmentTitle: 'Căn mốc từ & Lọc khoảng lặng (VAD)',
    guideAlignmentForced: 'Gắn mốc từ chính xác: Khớp từng từ theo mili-giây vào âm phổ thực tế của giọng nói.',
    guideAlignmentProportional: 'Nội suy kịch bản: Chia đều các từ theo thời gian khi âm thanh bị rè hoặc khó nhận diện.',
    guideVadDesc: 'Bộ lọc khoảng lặng (VAD): Tự động loại bỏ tiếng thở, khoảng lặng để cảnh chỉ gắn vào lời thoại thực sự.',
    guideVisionTitle: 'Mô hình thị giác máy tính (CLIP)',
    guideVisionClip: 'CLIP ViT-B/32 & ViT-L/14: Phân tích khung hình (vật thể, hành động, không khí) khớp với nội dung kịch bản.',
    guideVisionSiglip: 'SigLIP: Mô hình thị giác AI sâu, phân biệt các chi tiết thị giác phức tạp với độ chính xác cao.',
    guideMinShotDesc: 'Độ dài tối thiểu: Không cho shot cắt quá ngắn dưới mốc này để tránh giật mắt người xem.',
    guideConfidenceDesc: 'Ngưỡng lọc độ khớp: 50% là linh hoạt, 80% là tiêu chuẩn, 95% là chỉ lấy cảnh cực kỳ tương đồng.',
    guideSequenceTitle: 'Thông số Sequence & Giao thức xuất XML',
    guideFramerateDesc: 'Tốc độ khung hình: 24 fps (Điện ảnh), 25 fps (Truyền hình), 30 fps (YouTube/Web), 60 fps (Chuyển động mượt mà).',
    guideXmlDesc: 'Xuất XML: Tạo file timeline Premiere Pro XML chứa đầy đủ track video, audio để mở thẳng trong Adobe Premiere Pro.',

    activeVoice: 'Giọng đọc',
    script: 'Kịch bản',
    footage: 'Footage',
    clips: 'file',
    none: 'Chưa chọn',

    generalSettings: 'Cài đặt chung',
    generalSubtitle: 'Các thông số chính về nhịp điệu và căn khớp AI',
    processingProfile: 'Cấu hình xử lý',
    profileSubtitle: 'Cân bằng giữa tốc độ xử lý và độ chính xác',
    fastDraft: 'Bản nháp nhanh',
    balanced: 'Cân bằng',
    highAccuracy: 'Độ chính xác cao',
    custom: 'Tùy chỉnh',
    videoCutPacing: 'Nhịp điệu cắt cảnh',
    pacingSubtitle: 'Thời lượng trung bình mỗi cảnh B-Roll',
    fastCuts: 'Nhịp nhanh',
    cinematic: 'Điện ảnh',
    narrationLanguage: 'Ngôn ngữ giọng đọc',
    narrationSubtitle: 'Ngôn ngữ nói trong file âm thanh',
    autoDetect: 'Tự động nhận diện',
    targetFormat: 'Định dạng video đích',
    formatSubtitle: 'Tỷ lệ khung hình và độ phân giải timeline',
    footageCoverage: 'Độ phủ của Footage',
    coverageSubtitle: 'Cách footage lấp đầy các khoảng nghỉ trong câu thoại',
    fillEntireVoice: 'Phủ kín toàn bộ',
    matchKeySentences: 'Chỉ câu chính',

    advancedSettings: 'Cài đặt nâng cao',
    advancedSubtitle: 'Các thông số mô hình AI chuyên sâu và giao thức sequence',
    showAdvanced: 'Hiện nâng cao',
    hideAdvanced: 'Ẩn nâng cao',
    minShotDuration: 'Độ dài tối thiểu',
    minShotSubtitle: 'Tránh hiện tượng giật hình do cảnh quá ngắn',
    confidenceFilter: 'Ngưỡng lọc độ khớp',
    confidenceSubtitle: 'Mức độ tương đồng ngữ nghĩa bắt buộc',
    loose: 'Rộng',
    standard: 'Tiêu chuẩn',
    strict: 'Nghiêm ngặt',
    speechAlignmentEngine: 'Mô hình căn âm giọng đọc',
    whisperModel: 'Phiên bản Whisper',
    alignmentMode: 'Chế độ căn chỉnh',
    forcedWordAlignment: 'Gắn mốc từ chính xác',
    proportionalFallback: 'Nội suy kịch bản',
    vadFilter: 'Bộ lọc khoảng lặng (VAD)',
    enabled: 'Bật',
    disabled: 'Tắt',
    visionModelEngine: 'Mô hình thị giác máy tính',
    visionModel: 'Phiên bản CLIP/Vision',
    sequenceExportProtocol: 'Giao thức sequence và xuất file',
    sequenceFramerate: 'Tốc độ khung hình (FPS)',
    xmlExportProtocol: 'Định dạng xuất XML',

    noScenesAligned: 'Chưa có cảnh nào được phân tích',
    noScenesPrompt: 'Thiết lập cấu hình AI ở trên, sau đó bấm START ANALYSIS trên thanh Pipeline.',
    scene: 'Cảnh',
    match: 'Khớp',
    matched: 'Đã khớp',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: translations.en,
});

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('synccut_language');
      if (saved === 'vi' || saved === 'en') return saved;
    } catch {
      // fallback
    }
    return 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('synccut_language', lang);
    } catch {
      // ignore
    }
  };

  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
