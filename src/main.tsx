import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

type EngineReply = { ok: boolean; output: string };
type SourceInfo = { id: string; path: string; kind: string; duration: number; hasVideo: boolean; hasAudio: boolean };
type ProcessResult = { ok: boolean; event?: string; error?: string; output?: string; logPath?: string; plan?: { duration_frames: number; fps: number; visuals: unknown[]; warnings: string[] }; planPath?: string };
type PlanSummary = NonNullable<ProcessResult["plan"]>;

const videoTypes = ["mp4", "mov", "mxf", "mkv", "m4v", "avi", "webm", "jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp"];
const audioTypes = ["wav", "mp3", "m4a", "aac", "flac", "ogg", "aif", "aiff"];

function lastJson(text: string): ProcessResult | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]) as ProcessResult; } catch { /* keep scanning */ }
  }
  return null;
}

function prettyDuration(seconds?: number): string {
  if (seconds === undefined) return "Đang kiểm tra";
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function App() {
  const [voiceover, setVoiceover] = useState<string | null>(null);
  const [visuals, setVisuals] = useState<string[]>([]);
  const [sources, setSources] = useState<Record<string, SourceInfo>>({});
  const [status, setStatus] = useState("Sẵn sàng nhận source");
  const [log, setLog] = useState("");
  const [planPath, setPlanPath] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropTarget, setDropTarget] = useState<"voice" | "visual">("visual");

  const canProcess = Boolean(voiceover && visuals.length && !busy);
  const voiceInfo = voiceover ? sources[voiceover] : undefined;
  const totalVisuals = useMemo(() => visuals.map((path) => sources[path]).filter(Boolean), [visuals, sources]);

  async function inspect(paths: string[]) {
    if (!paths.length) return;
    const reply = await invoke<EngineReply>("run_engine", { args: ["probe", ...paths] });
    setLog(reply.output);
    const parsed = lastJson(reply.output) as (ProcessResult & { sources?: SourceInfo[] }) | null;
    if (!reply.ok || !parsed?.ok || !parsed.sources) throw new Error(parsed?.error || "Không thể kiểm tra source.");
    setSources((current) => Object.fromEntries([...Object.entries(current), ...parsed.sources!.map((source) => [source.path, source]) ]));
  }

  async function chooseVoiceover() {
    const selected = await open({ multiple: false, directory: false, filters: [{ name: "Voiceover", extensions: audioTypes }] });
    if (typeof selected !== "string") return;
    try { await inspect([selected]); setVoiceover(selected); setPlan(null); setPlanPath(null); setLogPath(null); setStatus("Voiceover đã sẵn sàng"); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Không thể đọc voiceover."); }
  }

  async function addVisuals(paths?: string[]) {
    const selected = paths ?? await open({ multiple: true, directory: false, filters: [{ name: "Video và ảnh", extensions: videoTypes }] });
    const list = (Array.isArray(selected) ? selected : selected ? [selected] : []).filter((path) => !visuals.includes(path));
    if (!list.length) return;
    try {
      await inspect(list);
      setVisuals((current) => [...current, ...list]);
      setPlan(null); setPlanPath(null); setLogPath(null); setStatus(`Đã thêm ${list.length} nguồn hình`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Không thể đọc footage."); }
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        const dropped = event.payload.paths.map(String);
        if (dropTarget === "voice" && dropped[0]) {
          void (async () => {
            try { await inspect([dropped[0]]); setVoiceover(dropped[0]); setPlan(null); setPlanPath(null); setLogPath(null); setStatus("Voiceover đã sẵn sàng"); }
            catch (error) { setStatus(error instanceof Error ? error.message : "Không thể đọc voiceover."); }
          })();
        } else {
          void addVisuals(dropped);
        }
      }
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, [dropTarget, visuals]);

  async function processProject() {
    if (!voiceover || !visuals.length) return;
    setBusy(true); setPlan(null); setPlanPath(null); setStatus("Đang kiểm tra và lập timeline an toàn…");
    try {
      const workspace = await invoke<string>("project_workspace");
      const jobId = crypto.randomUUID();
      const generatedPlan = `${workspace.replace(/[\\/]+$/, "")}/sync-${jobId}.synccut.json`;
      const generatedLog = `${workspace.replace(/[\\/]+$/, "")}/sync-${jobId}.jsonl`;
      const reply = await invoke<EngineReply>("run_engine", { args: ["process", "--voiceover", voiceover, ...visuals.flatMap((path) => ["--visual", path]), "--plan", generatedPlan, "--log", generatedLog, "--fps", "30"] });
      setLog(reply.output);
      const parsed = lastJson(reply.output);
      if (!reply.ok || !parsed?.ok || !parsed.planPath || !parsed.plan) throw new Error(parsed?.error || "Engine không tạo được timeline.");
      setPlan(parsed.plan); setPlanPath(parsed.planPath); setLogPath(parsed.logPath ?? generatedLog);
      setStatus("Timeline đã được kiểm tra. Bạn có thể xuất XML cho Premiere.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Xử lý thất bại."); }
    finally { setBusy(false); }
  }

  async function exportXml() {
    if (!planPath || !voiceover) return;
    const destination = await save({ defaultPath: "SyncCut-Assembly.xml", filters: [{ name: "Premiere XML", extensions: ["xml"] }] });
    if (!destination) return;
    setBusy(true); setStatus("Đang xác minh và ghi XML…");
    try {
      const reply = await invoke<EngineReply>("run_engine", { args: ["export", "--plan", planPath, "--output", destination, "--log", logPath ?? `${planPath}.export.jsonl`, "--source", voiceover, ...visuals.flatMap((path) => ["--source", path])] });
      setLog(reply.output);
      const parsed = lastJson(reply.output);
      if (!reply.ok || !parsed?.ok) throw new Error(parsed?.error || "Không xuất được XML.");
      setStatus(`Đã xuất XML: ${parsed.output}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Xuất XML thất bại."); }
    finally { setBusy(false); }
  }

  return <main>
    <header><div><span className="eyebrow">LOCAL ASSEMBLY FOR PREMIERE</span><h1>SyncCut</h1></div><div className="status"><span className={busy ? "dot working" : "dot"} />{status}</div></header>
    <section className="intro"><h2>Nhập source, dựng bản nháp, xuất XML.</h2><p>Voiceover luôn được giữ nguyên. Hình sẽ phủ kín timeline; các cảnh thay thế được đánh dấu để hậu kỳ trong Premiere.</p></section>
    <section className="source-grid">
      <div className="source-card" onDragEnter={() => setDropTarget("voice")}>
        <span className="label">01 · VOICEOVER</span><h3>File lời đọc</h3>
        {voiceover ? <div className="source-row"><div><strong>{voiceover.split(/[\\/]/).pop()}</strong><small>{voiceInfo ? `${prettyDuration(voiceInfo.duration)} · audio` : "Đang kiểm tra"}</small></div><button className="quiet" onClick={() => { setVoiceover(null); setPlan(null); setPlanPath(null); setLogPath(null); }}>Xóa</button></div> : <p className="hint">Kéo thả file audio vào đây hoặc chọn file.</p>}
        <button onClick={() => void chooseVoiceover()}>{voiceover ? "Thay voiceover" : "Chọn voiceover"}</button>
      </div>
      <div className="source-card" onDragEnter={() => setDropTarget("visual")}>
        <span className="label">02 · FOOTAGE & IMAGES</span><h3>Nguồn hình</h3>
        {visuals.length ? <div className="list">{visuals.map((path) => <div className="source-row" key={path}><div><strong>{path.split(/[\\/]/).pop()}</strong><small>{sources[path] ? `${prettyDuration(sources[path].duration)} · ${sources[path].kind}` : "Đang kiểm tra"}</small></div><button className="quiet" onClick={() => { setVisuals((current) => current.filter((item) => item !== path)); setPlan(null); setPlanPath(null); setLogPath(null); }}>Xóa</button></div>)}</div> : <p className="hint">Kéo thả nhiều video hoặc ảnh vào đây.</p>}
        <button onClick={() => void addVisuals()}>Thêm footage / ảnh</button>
      </div>
    </section>
    <section className="action-panel"><div><span className="label">ASSEMBLY</span><h3>{plan ? `${plan.visuals.length} đoạn hình · ${prettyDuration(plan.duration_frames / plan.fps)}` : "Chưa có timeline"}</h3><p>{plan ? "Timeline được kiểm tra phủ kín voiceover và giới hạn source trước khi xuất." : "Phân tích AI sẽ được nối sau khi bộ xuất XML đã được xác thực trong Premiere 2024."}</p></div><div className="actions"><button className="primary" disabled={!canProcess} onClick={() => void processProject()}>{busy ? "Đang xử lý…" : "Phân tích & dựng"}</button><button disabled={!planPath || busy} onClick={() => void exportXml()}>Xuất XML cho Premiere</button></div></section>
    {plan?.warnings?.length ? <section className="notice"><strong>Cần xem lại trong Premiere</strong>{plan.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section> : null}
    <details><summary>Nhật ký xử lý{logPath ? ` · ${logPath}` : ""}</summary><pre>{log || "Chưa có tiến trình nào."}</pre></details>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
