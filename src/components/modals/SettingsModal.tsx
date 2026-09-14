import React, { useState } from 'react';
import { useLanguage } from '../../i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  outputDir: string;
  onPickOutputDir: () => void;
}

export type AIMode = 'local' | 'cloud';
export type AIProvider = 'deepseek' | 'openai' | 'anthropic' | 'custom';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  outputDir,
  onPickOutputDir,
}) => {
  const { language, setLanguage } = useLanguage();

  // AI Configuration State
  const [aiMode, setAiMode] = useState<AIMode>(() => {
    return (localStorage.getItem('synccut_ai_mode') as AIMode) || 'local';
  });
  const [aiProvider, setAiProvider] = useState<AIProvider>(() => {
    return (localStorage.getItem('synccut_ai_provider') as AIProvider) || 'deepseek';
  });
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('synccut_ai_api_key') || '';
  });
  const [modelName, setModelName] = useState<string>(() => {
    return localStorage.getItem('synccut_ai_model') || 'deepseek-chat';
  });
  const [customEndpoint, setCustomEndpoint] = useState<string>(() => {
    return localStorage.getItem('synccut_ai_custom_endpoint') || '';
  });

  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testFeedback, setTestFeedback] = useState<string>('');
  const [saveIndicator, setSaveIndicator] = useState<string>('');

  // Default models map for each provider
  const defaultModels: Record<AIProvider, string> = {
    deepseek: 'deepseek-chat',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-latest',
    custom: '',
  };

  // Default API base URLs
  const defaultEndpoints: Record<AIProvider, string> = {
    deepseek: 'https://api.deepseek.com',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    custom: '',
  };

  const handleProviderChange = (newProvider: AIProvider) => {
    setAiProvider(newProvider);
    localStorage.setItem('synccut_ai_provider', newProvider);
    const defModel = defaultModels[newProvider];
    setModelName(defModel);
    localStorage.setItem('synccut_ai_model', defModel);
    setTestStatus('idle');
    setTestFeedback('');
  };

  const handleModeChange = (newMode: AIMode) => {
    setAiMode(newMode);
    localStorage.setItem('synccut_ai_mode', newMode);
  };

  const handleSaveAIConfig = () => {
    localStorage.setItem('synccut_ai_mode', aiMode);
    localStorage.setItem('synccut_ai_provider', aiProvider);
    localStorage.setItem('synccut_ai_api_key', apiKey.trim());
    localStorage.setItem('synccut_ai_model', modelName.trim());
    localStorage.setItem('synccut_ai_custom_endpoint', customEndpoint.trim());
    setSaveIndicator(language === 'vi' ? 'Đã lưu cấu hình' : 'Settings saved');
    setTimeout(() => setSaveIndicator(''), 3000);
  };

  const handleClearAIConfig = () => {
    setApiKey('');
    setCustomEndpoint('');
    localStorage.removeItem('synccut_ai_api_key');
    localStorage.removeItem('synccut_ai_custom_endpoint');
    setTestStatus('idle');
    setTestFeedback('');
    setSaveIndicator(language === 'vi' ? 'Đã xoá API key' : 'API key cleared');
    setTimeout(() => setSaveIndicator(''), 3000);
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestStatus('failed');
      setTestFeedback(language === 'vi' ? 'Vui lòng nhập API key trước khi kiểm tra' : 'Please enter an API key first');
      return;
    }

    setTestStatus('testing');
    setTestFeedback(language === 'vi' ? 'Đang kiểm tra kết nối...' : 'Testing connection...');

    const trimmedKey = apiKey.trim();

    try {
      if (aiProvider === 'openai') {
        const endpoint = customEndpoint.trim() || defaultEndpoints.openai;
        const res = await fetch(`${endpoint}/models`, {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
          },
        });
        if (res.ok) {
          setTestStatus('success');
          setTestFeedback(language === 'vi' ? 'Kết nối thành công với OpenAI API' : 'Connection successful with OpenAI API');
        } else {
          const err = await res.json().catch(() => ({}));
          setTestStatus('failed');
          setTestFeedback(err?.error?.message || `HTTP error ${res.status}`);
        }
      } else if (aiProvider === 'deepseek') {
        const endpoint = customEndpoint.trim() || defaultEndpoints.deepseek;
        const res = await fetch(`${endpoint}/models`, {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
          },
        });
        if (res.ok) {
          setTestStatus('success');
          setTestFeedback(language === 'vi' ? 'Kết nối thành công với DeepSeek API' : 'Connection successful with DeepSeek API');
        } else {
          const err = await res.json().catch(() => ({}));
          setTestStatus('failed');
          setTestFeedback(err?.error?.message || `HTTP error ${res.status}`);
        }
      } else if (aiProvider === 'anthropic') {
        const endpoint = customEndpoint.trim() || defaultEndpoints.anthropic;
        const res = await fetch(`${endpoint}/messages`, {
          method: 'POST',
          headers: {
            'x-api-key': trimmedKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName || 'claude-3-5-haiku-latest',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        });
        if (res.ok) {
          setTestStatus('success');
          setTestFeedback(language === 'vi' ? 'Kết nối thành công với Anthropic Claude API' : 'Connection successful with Anthropic Claude API');
        } else {
          const err = await res.json().catch(() => ({}));
          setTestStatus('failed');
          setTestFeedback(err?.error?.message || `HTTP error ${res.status}`);
        }
      } else {
        // Custom OpenAI-compatible
        const endpoint = (customEndpoint.trim() || defaultEndpoints.openai).replace(/\/+$/, '');
        const res = await fetch(`${endpoint}/models`, {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
          },
        });
        if (res.ok) {
          setTestStatus('success');
          setTestFeedback(language === 'vi' ? 'Kết nối thành công với Custom Endpoint' : 'Connection successful with Custom Endpoint');
        } else {
          setTestStatus('failed');
          setTestFeedback(`HTTP status ${res.status}`);
        }
      }
    } catch (err: any) {
      setTestStatus('failed');
      setTestFeedback(err?.message || (language === 'vi' ? 'Lỗi kết nối mạng' : 'Network connection error'));
    }
  };

  const handleResetStorage = () => {
    const confirmMsg = language === 'vi'
      ? 'Bạn có chắc chắn muốn xoá toàn bộ bộ nhớ tạm và đặt lại cài đặt về mặc định không?'
      : 'Are you sure you want to clear all local storage and reset settings to default?';
    if (window.confirm(confirmMsg)) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 select-none p-4 font-sans">
      <div className="w-full max-w-xl bg-[#1a1a1a] border border-[#333333] rounded shadow-2xl flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="h-10 px-4 bg-[#222222] border-b border-[#2e2e2e] flex items-center justify-between">
          <span className="font-semibold text-white tracking-wide">
            {language === 'vi' ? 'Cài đặt ứng dụng' : 'Application Settings'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#888888] hover:text-white px-2 py-0.5 rounded hover:bg-[#333333] transition-colors cursor-pointer"
          >
            {language === 'vi' ? 'Đóng' : 'Close'}
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[75vh]">
          {/* ======================================================== */}
          {/* SECTION: AI ENGINE & API KEY CONFIGURATION               */}
          {/* ======================================================== */}
          <div className="flex flex-col gap-3 bg-[#141414] border border-[#2a2a2a] p-3.5 rounded">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-white">
                  {language === 'vi' ? 'Cấu hình AI & API Keys' : 'AI Engine & API Configuration'}
                </span>
                <div className="text-[#888888] text-[11px] mt-0.5">
                  {language === 'vi'
                    ? 'Hỗ trợ phân tích ngữ nghĩa kịch bản & tối ưu ghép cảnh B-Roll'
                    : 'Script semantic enhancement & automated B-Roll scene assembly'}
                </div>
              </div>
              {saveIndicator && (
                <span className="text-[11px] font-mono text-white bg-[#282828] px-2 py-0.5 rounded border border-[#3e3e3e]">
                  {saveIndicator}
                </span>
              )}
            </div>

            {/* AI Engine Mode Toggle */}
            <div className="flex items-center gap-1 bg-[#0e0e0e] p-1 rounded border border-[#222222]">
              <button
                type="button"
                onClick={() => handleModeChange('local')}
                className={`flex-1 py-1.5 px-2 rounded text-center transition-colors cursor-pointer ${
                  aiMode === 'local'
                    ? 'bg-[#2a2a2a] text-white font-semibold'
                    : 'text-[#888888] hover:text-[#cccccc]'
                }`}
              >
                {language === 'vi' ? 'AI Nội bộ (Local - Miễn phí)' : 'Local Engine (Free & Offline)'}
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('cloud')}
                className={`flex-1 py-1.5 px-2 rounded text-center transition-colors cursor-pointer ${
                  aiMode === 'cloud'
                    ? 'bg-[#2a2a2a] text-white font-semibold'
                    : 'text-[#888888] hover:text-[#cccccc]'
                }`}
              >
                {language === 'vi' ? 'Cloud AI (DeepSeek / Claude / GPT)' : 'Cloud AI (BYOK - Bring Your Key)'}
              </button>
            </div>

            {/* Cloud Provider Details (when Cloud mode is active) */}
            {aiMode === 'cloud' ? (
              <div className="flex flex-col gap-3 pt-1">
                {/* Provider Selector */}
                <div className="flex flex-col gap-1">
                  <span className="text-[#888888] font-mono text-[11px]">
                    {language === 'vi' ? 'Nhà cung cấp AI:' : 'AI Provider:'}
                  </span>
                  <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
                    {(['deepseek', 'openai', 'anthropic', 'custom'] as AIProvider[]).map((p) => {
                      const labels: Record<AIProvider, string> = {
                        deepseek: 'DeepSeek',
                        openai: 'OpenAI',
                        anthropic: 'Claude',
                        custom: 'Custom',
                      };
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleProviderChange(p)}
                          className={`py-1.5 px-2 rounded border text-center transition-colors cursor-pointer ${
                            aiProvider === p
                              ? 'bg-[#282828] text-white border-[#555555] font-bold'
                              : 'bg-[#121212] text-[#888888] border-[#222222] hover:text-white'
                          }`}
                        >
                          {labels[p]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* API Key Input */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[#888888] font-mono text-[11px]">
                      {aiProvider.toUpperCase()} API Key:
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="text-[#888888] hover:text-white font-mono text-[10px] cursor-pointer"
                    >
                      {showKey ? (language === 'vi' ? 'Ẩn' : 'Hide') : (language === 'vi' ? 'Hiện' : 'Show')}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setTestStatus('idle');
                        setTestFeedback('');
                      }}
                      placeholder={
                        aiProvider === 'deepseek'
                          ? 'sk-...'
                          : aiProvider === 'openai'
                          ? 'sk-proj-...'
                          : aiProvider === 'anthropic'
                          ? 'sk-ant-...'
                          : 'API key...'
                      }
                      className="flex-1 bg-[#0d0d0d] border border-[#2e2e2e] focus:border-[#555555] rounded px-2.5 py-1.5 text-white font-mono text-[11px] outline-none select-text"
                    />
                    <button
                      type="button"
                      onClick={handleSaveAIConfig}
                      className="px-3 py-1.5 bg-[#262626] hover:bg-[#333333] text-white border border-[#444444] rounded font-mono text-[11px] transition-colors cursor-pointer"
                    >
                      {language === 'vi' ? 'Lưu' : 'Save'}
                    </button>
                    {apiKey && (
                      <button
                        type="button"
                        onClick={handleClearAIConfig}
                        className="px-2 py-1.5 bg-[#1f1f1f] hover:bg-[#2c2c2c] text-[#888888] hover:text-white border border-[#303030] rounded font-mono text-[11px] transition-colors cursor-pointer"
                        title="Clear Key"
                      >
                        {language === 'vi' ? 'Xoá' : 'Clear'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Model Name Selector */}
                <div className="flex flex-col gap-1">
                  <span className="text-[#888888] font-mono text-[11px]">
                    {language === 'vi' ? 'Mô hình phân tích (Model):' : 'Analysis Model:'}
                  </span>
                  {aiProvider === 'deepseek' ? (
                    <select
                      value={modelName}
                      onChange={(e) => {
                        setModelName(e.target.value);
                        localStorage.setItem('synccut_ai_model', e.target.value);
                      }}
                      className="bg-[#0d0d0d] border border-[#2e2e2e] rounded px-2 py-1.5 text-white font-mono text-[11px] outline-none cursor-pointer"
                    >
                      <option value="deepseek-chat">deepseek-chat (V3 - Fast & Highly Accurate)</option>
                      <option value="deepseek-reasoner">deepseek-reasoner (R1 - Deep Visual Reasoning)</option>
                    </select>
                  ) : aiProvider === 'openai' ? (
                    <select
                      value={modelName}
                      onChange={(e) => {
                        setModelName(e.target.value);
                        localStorage.setItem('synccut_ai_model', e.target.value);
                      }}
                      className="bg-[#0d0d0d] border border-[#2e2e2e] rounded px-2 py-1.5 text-white font-mono text-[11px] outline-none cursor-pointer"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (Cost-effective & High Speed)</option>
                      <option value="gpt-4o">gpt-4o (Multimodal Vision & High Precision)</option>
                    </select>
                  ) : aiProvider === 'anthropic' ? (
                    <select
                      value={modelName}
                      onChange={(e) => {
                        setModelName(e.target.value);
                        localStorage.setItem('synccut_ai_model', e.target.value);
                      }}
                      className="bg-[#0d0d0d] border border-[#2e2e2e] rounded px-2 py-1.5 text-white font-mono text-[11px] outline-none cursor-pointer"
                    >
                      <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest (Top Editorial Quality)</option>
                      <option value="claude-3-5-haiku-latest">claude-3-5-haiku-latest (Fast Pacing & Script Beats)</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={modelName}
                      onChange={(e) => {
                        setModelName(e.target.value);
                        localStorage.setItem('synccut_ai_model', e.target.value);
                      }}
                      placeholder="e.g. llama-3.3-70b-versatile, mistral-large"
                      className="bg-[#0d0d0d] border border-[#2e2e2e] rounded px-2.5 py-1.5 text-white font-mono text-[11px] outline-none select-text"
                    />
                  )}
                </div>

                {/* Custom Endpoint (Visible when custom or as optional base override) */}
                {(aiProvider === 'custom' || customEndpoint) && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[#888888] font-mono text-[11px]">
                      {language === 'vi' ? 'Địa chỉ máy chủ API (Base URL):' : 'Custom Base URL:'}
                    </span>
                    <input
                      type="text"
                      value={customEndpoint}
                      onChange={(e) => {
                        setCustomEndpoint(e.target.value);
                        localStorage.setItem('synccut_ai_custom_endpoint', e.target.value);
                      }}
                      placeholder="https://openrouter.ai/api/v1"
                      className="bg-[#0d0d0d] border border-[#2e2e2e] rounded px-2.5 py-1.5 text-white font-mono text-[11px] outline-none select-text"
                    />
                  </div>
                )}

                {/* Test Connection Button & Status */}
                <div className="flex items-center justify-between pt-1 border-t border-[#222222]">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testStatus === 'testing'}
                    className="px-3 py-1.5 bg-[#252525] hover:bg-[#323232] disabled:bg-[#1a1a1a] text-white border border-[#404040] rounded font-mono text-[11px] transition-colors cursor-pointer"
                  >
                    {testStatus === 'testing'
                      ? (language === 'vi' ? 'Đang kiểm tra...' : 'Testing...')
                      : (language === 'vi' ? 'Kiểm tra kết nối' : 'Test Connection')}
                  </button>

                  {testFeedback && (
                    <span className="text-[11px] font-mono text-[#cccccc] truncate max-w-[300px]">
                      {testFeedback}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-[#777777] font-mono bg-[#0e0e0e] p-2.5 rounded border border-[#222222] leading-relaxed">
                {language === 'vi'
                  ? 'Ứng dụng đang chạy hoàn toàn bằng AI cục bộ (Whisper + CLIP) trên máy tính của bạn. Không cần API key, hoàn toàn miễn phí và bảo mật tuyệt đối không gửi dữ liệu ra ngoài.'
                  : 'Running 100% locally via Whisper speech-alignment and CLIP visual embedding on your PC. No API key required, completely free and private.'}
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* SECTION: EXPORT OUTPUT DIRECTORY                          */}
          {/* ======================================================== */}
          <div className="flex flex-col gap-1.5 bg-[#141414] border border-[#2a2a2a] p-3 rounded">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">
                {language === 'vi' ? 'Thư mục xuất mặc định' : 'Default Export Directory'}
              </span>
              <button
                type="button"
                onClick={onPickOutputDir}
                className="px-2.5 py-1 bg-[#282828] hover:bg-[#353535] text-white border border-[#404040] rounded text-[11px] transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Duyệt thư mục...' : 'Browse...'}
              </button>
            </div>
            <div className="text-[11px] font-mono text-[#aaaaaa] bg-[#0d0d0d] px-2 py-1.5 rounded border border-[#222222] break-all select-all">
              {outputDir || (language === 'vi' ? 'Chưa thiết lập (hỏi khi xuất file)' : 'Not set (will prompt on export)')}
            </div>
          </div>

          {/* ======================================================== */}
          {/* SECTION: INTERFACE LANGUAGE                              */}
          {/* ======================================================== */}
          <div className="flex items-center justify-between bg-[#141414] border border-[#2a2a2a] p-3 rounded">
            <div>
              <div className="font-semibold text-white">
                {language === 'vi' ? 'Ngôn ngữ giao diện' : 'Interface Language'}
              </div>
              <div className="text-[#888888] text-[11px] mt-0.5">
                {language === 'vi' ? 'Chọn ngôn ngữ hiển thị chính' : 'Select primary UI language'}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-[#0d0d0d] border border-[#2e2e2e] rounded p-0.5 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  language === 'en' ? 'bg-[#333333] text-white font-bold' : 'text-[#888888] hover:text-white'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage('vi')}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  language === 'vi' ? 'bg-[#333333] text-white font-bold' : 'text-[#888888] hover:text-white'
                }`}
              >
                Tiếng Việt
              </button>
            </div>
          </div>

          {/* ======================================================== */}
          {/* SECTION: APPLICATION INFORMATION                         */}
          {/* ======================================================== */}
          <div className="flex flex-col gap-1 bg-[#141414] border border-[#2a2a2a] p-3 rounded font-mono text-[11px]">
            <div className="text-white font-semibold mb-1">
              {language === 'vi' ? 'Thông tin ứng dụng' : 'Application Information'}
            </div>
            <div className="flex justify-between text-[#888888]">
              <span>Name:</span>
              <span className="text-[#cccccc]">SyncCut AI</span>
            </div>
            <div className="flex justify-between text-[#888888]">
              <span>Version:</span>
              <span className="text-[#cccccc]">v0.1.0</span>
            </div>
            <div className="flex justify-between text-[#888888]">
              <span>Architecture:</span>
              <span className="text-[#cccccc]">Windows x64 (Tauri v2)</span>
            </div>
          </div>

          {/* ======================================================== */}
          {/* SECTION: CACHE & RESET                                   */}
          {/* ======================================================== */}
          <div className="flex items-center justify-between bg-[#141414] border border-[#2a2a2a] p-3 rounded">
            <div>
              <div className="font-semibold text-white">
                {language === 'vi' ? 'Dọn dẹp & Đặt lại' : 'Cache & Reset'}
              </div>
              <div className="text-[#888888] text-[11px] mt-0.5">
                {language === 'vi' ? 'Xoá cache dữ liệu và cài đặt đã lưu' : 'Clear all cached project data and reset to defaults'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetStorage}
              className="px-3 py-1 bg-[#282828] hover:bg-[#3a2222] text-[#cccccc] hover:text-white border border-[#3e3e3e] rounded text-[11px] transition-colors cursor-pointer"
            >
              {language === 'vi' ? 'Đặt lại' : 'Reset'}
            </button>
          </div>
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

export default SettingsModal;
