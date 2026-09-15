import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { safeConvertFileSrc } from "../utils/mediaUtils";
import { Monitor } from "./Monitor";
import { Dropdown } from "./Dropdown";
import { YouTubeDownloadModal } from "../components/workspace/YouTubeDownloadModal";
import { BeatEditor, Candidates } from "./Review";
import {
  Asset,
  Beat,
  clock,
  fpsOf,
  Job,
  Project,
  Runtime,
  RuntimePrerequisites,
  RuntimeSetup,
} from "./types";
import "./studio.css";

const steps = ["Import & Preview", "Check narration", "Review visual suggestions", "Preview & Export"] as const;
function clearScenes(p: Project) {
  p.shots = [];
  p.matches = [];
  p.clips = [];
  p.exportPath = null;
}
function clearSpeech(p: Project) {
  clearScenes(p);
  p.words = [];
  p.beats = [];
  p.duration = 0;
}
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const bytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index < 2 ? 0 : 1)} ${units[index]}`;
};
const stageLabel = (stage: string) => ({
  python: "Creating local Python environment", packages: "Installing local AI packages",
  media: "Preparing media tools", models: "Downloading AI models", verify: "Checking GPU and media tools",
  ready: "Ready", starting: "Preparing installation",
}[stage] ?? "Installing runtime");

export default function Studio() {
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef<Project | null>(null);
  const [step, setStep] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const jobRef = useRef<Job | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(0);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const failedRef = useRef(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const [runtimePrerequisites, setRuntimePrerequisites] =
    useState<RuntimePrerequisites | null>(null);
  const [runtimeSetup, setRuntimeSetup] = useState<RuntimeSetup | null>(null);
  const [runtimeProfile, setRuntimeProfile] = useState<"fast" | "quality">(
    "fast",
  );
  const [runtimeTextIndex, setRuntimeTextIndex] = useState(false);
  const [runtimeChecking, setRuntimeChecking] = useState(false);
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "ready" | "latest" | "installing">("idle");
  const [updateVersion, setUpdateVersion] = useState("");
  const [runtimeInstallRoot, setRuntimeInstallRoot] = useState("");
  const [modelInstallRoot, setModelInstallRoot] = useState("");
  const [source, setSource] = useState<Asset | null>(null);
  const [sourceStart, setSourceStart] = useState(0);
  const monitorElement = useRef<HTMLDivElement>(null);
  const sourceDrag = useRef<{ id: string; x: number; y: number; fromPreview?: boolean } | null>(null);
  const [dragGhost, setDragGhost] = useState<{ asset: Asset; x: number; y: number; fromPreview: boolean; overPreview: boolean } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sourceMenu, setSourceMenu] = useState<{ asset: Asset; x: number; y: number } | null>(null);
  const sourceMenuRef = useRef<HTMLDivElement>(null);
  const [beatId, setBeatId] = useState("");
  const [clipId, setClipId] = useState("");
  const [time, setTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState(0);
  const [allowGaps, setAllowGaps] = useState(false);
  const applied = useRef("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadDir, setDownloadDir] = useState("");
  const busy =
    starting || refreshing || job?.status === "running" || saveFailed;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const adopt = useCallback((p: Project) => {
    projectRef.current = p;
    setProject(p);
  }, []);
  const reload = useCallback(async () => {
    const p = projectRef.current;
    if (!p) return;
    await chain.current;
    const fresh = await invoke<Project>("studio_load_project", {
      root: p.root,
    });
    adopt(fresh);
    failedRef.current = false;
    setSaveFailed(false);
    setError("");
  }, [adopt]);
  const receiveJob = useCallback(
    (j: Job | null) => {
      if (j && j.root !== projectRef.current?.root) return;
      jobRef.current = j;
      setJob(j);
      if (j?.status === "completed" && applied.current !== j.id) {
        applied.current = j.id;
        setRefreshing(true);
        invoke<Project>("studio_load_project", { root: j.root })
          .then((p) => {
            if (projectRef.current?.root !== p.root) return;
            adopt(p);
            setSource(null);
            if (j.stage === "speech") setStep(1);
            if (j.stage === "match") setStep(2);
          })
          .catch((e) => {
            failedRef.current = true;
            setSaveFailed(true);
            setError(
              `Cannot load the completed job: ${errorText(e)} Reload the saved project.`,
            );
          })
          .finally(() => setRefreshing(false));
      }
    },
    [adopt],
  );
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    invoke<Project | null>("studio_bootstrap")
      .then(async (p) => {
        if (disposed || !p) return;
        adopt(p);
        receiveJob(await invoke<Job | null>("studio_job", { root: p.root }));
      })
      .catch((e) => !disposed && setError(errorText(e)));
    invoke<Runtime>("studio_runtime", { pick: false })
      .then((r) => !disposed && setRuntime(r))
      .catch((e) => !disposed && setError(errorText(e)));
    listen<Job>("studio-job", (e) => !disposed && receiveJob(e.payload)).then(
      (fn) => {
        if (disposed) fn();
        else unlisten = fn;
      },
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [adopt, receiveJob]);
  useEffect(() => {
    if (!runtimeOpen) return;
    let disposed = false;
    let lastStatus = "";
    const refresh = async () => {
      try {
        const [nextRuntime, prerequisites, setup] = await Promise.all([
          invoke<Runtime>("studio_runtime", { pick: false }),
          invoke<RuntimePrerequisites>("studio_runtime_prerequisites"),
          invoke<RuntimeSetup | null>("studio_runtime_setup_status"),
        ]);
        if (!disposed) {
          setRuntime(nextRuntime);
          setRuntimePrerequisites(prerequisites);
          setRuntimeInstallRoot((value) => value || prerequisites.installRoot);
          setModelInstallRoot((value) => value || prerequisites.modelRoot || prerequisites.defaultModelRoot);
          setRuntimeSetup(setup);
          lastStatus = setup?.status ?? "";
        }
      } catch (e) {
        if (!disposed) setError(errorText(e));
      } finally {
        if (!disposed) setRuntimeChecking(false);
      }
    };
    setRuntimeChecking(true);
    void refresh();
    const timer = window.setInterval(() => {
      invoke<RuntimeSetup | null>("studio_runtime_setup_status")
        .then(async (setup) => {
          if (disposed) return;
          setRuntimeSetup(setup);
          if (setup?.status === "completed" && lastStatus !== "completed") {
            const nextRuntime = await invoke<Runtime>("studio_runtime", { pick: false });
            if (!disposed) setRuntime(nextRuntime);
          }
          lastStatus = setup?.status ?? "";
        })
        .catch((e) => !disposed && setError(errorText(e)));
    }, 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [runtimeOpen]);
  useEffect(() => {
    if (job?.status !== "running") return;
    const timer = setInterval(() => {
      const p = projectRef.current;
      if (p)
        invoke<Job | null>("studio_job", { root: p.root })
          .then(receiveJob)
          .catch((e) => setError(errorText(e)));
    }, 2500);
    return () => clearInterval(timer);
  }, [job?.status, receiveJob]);

  function change(edit: (p: Project) => void) {
    if (busyRef.current || !projectRef.current) return;
    const old = projectRef.current;
    const next = structuredClone(old);
    edit(next);
    next.revision = old.revision + 1;
    next.exportPath = null;
    adopt(next);
    setSaving((n) => n + 1);
    chain.current = chain.current
      .then(async () => {
        if (failedRef.current) return;
        try {
          await invoke("studio_save_project", {
            project: next,
            expectedRevision: old.revision,
          });
        } catch (e) {
          failedRef.current = true;
          setSaveFailed(true);
          setError(
            `Changes could not be saved: ${errorText(e)} Reload the saved project before continuing.`,
          );
        }
      })
      .finally(() => setSaving((n) => n - 1));
  }
  async function openProject() {
    try {
      setStarting(true);
      await chain.current;
      const p = await invoke<Project | null>("studio_open_project");
      if (p) {
        adopt(p);
        setStep(0);
        setTime(0);
        setSource(null);
        setSelected([]);
        setBeatId("");
        setClipId("");
        failedRef.current = false;
        setSaveFailed(false);
        setError("");
        receiveJob(await invoke<Job | null>("studio_job", { root: p.root }));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  }
  const importRef = useRef<(paths?: string[]) => Promise<void>>(async () => {});
  async function importFiles(paths?: string[]) {
    if (busyRef.current || !projectRef.current) return;
    try {
      const assets = await invoke<Asset[]>("studio_import", {
        paths: paths ?? null,
      });
      if (busyRef.current) return;
      change((p) => {
        const fresh = assets.filter(
          (a) => !p.assets.some((b) => b.id === a.id),
        );
        p.assets.push(...fresh);
        if (!p.voiceId)
          p.voiceId = fresh.find((a) => a.kind === "voice")?.id ?? null;
        if (!p.scriptId)
          p.scriptId = fresh.find((a) => a.kind === "script")?.id ?? null;
        const visuals = fresh
          .filter((a) => a.kind === "video" || a.kind === "image")
          .map((a) => a.id);
        if (visuals.length) {
          clearScenes(p);
        }
      });
      setSelected(assets.map((a) => a.id));
    } catch (e) {
      setError(errorText(e));
    }
  }
  importRef.current = importFiles;
  useEffect(() => {
    // Tauri's native file-drop handler disables HTML5 drag/drop on Windows.
    // Pointer gestures keep internal preview dragging independent of Explorer imports.
    const cancel = () => {
      sourceDrag.current = null;
      setDragGhost(null);
      document.body.classList.remove("sc-dragging-source");
    };
    const move = (event: PointerEvent) => {
      const drag = sourceDrag.current;
      if (!drag || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      const asset = projectRef.current?.assets.find((a) => a.id === drag.id);
      const bounds = monitorElement.current?.getBoundingClientRect();
      if (!asset || !bounds) return;
      document.body.classList.add("sc-dragging-source");
      setDragGhost({ asset, x: event.clientX, y: event.clientY, fromPreview: !!drag.fromPreview, overPreview: event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom });
    };
    const finish = (event: PointerEvent) => {
      const drag = sourceDrag.current;
      cancel();
      if (
        !drag ||
        Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8
      )
        return;
      const bounds = monitorElement.current?.getBoundingClientRect();
      if (!bounds || busyRef.current) return;
      const overPreview = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (drag.fromPreview) {
        if (!overPreview && event.clientX >= 0 && event.clientX <= window.innerWidth && event.clientY >= 0 && event.clientY <= window.innerHeight) {
          change((p) => { p.visualIds = p.visualIds.filter((id) => id !== drag.id); clearScenes(p); });
          setSource(null);
        }
        return;
      }
      if (!overPreview) return;
      const asset = projectRef.current?.assets.find((a) => a.id === drag.id);
      if (asset && !busyRef.current) {
        if (!projectRef.current?.visualIds.includes(asset.id)) change((p) => { p.visualIds.push(asset.id); clearScenes(p); });
        setSelected([asset.id]);
        setSourceStart(0);
        setSource({ ...asset });
      }
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, []);
  useEffect(() => {
    if (!sourceMenu) return;
    sourceMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: Event) => {
      if (!sourceMenuRef.current?.contains(event.target as Node)) setSourceMenu(null);
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [sourceMenu]);
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type === "drop") void importRef.current(e.payload.paths);
      })
      .then((fn) => {
        if (disposed) fn();
        else off = fn;
      })
      .catch((e) => setError(errorText(e)));
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  async function start(stage: Job["stage"]) {
    if (busyRef.current) return;
    setStarting(true);
    setError("");
    try {
      await chain.current;
      if (failedRef.current) return;
      const p = projectRef.current!;
      receiveJob(
        await invoke<Job>("studio_start_job", {
          root: p.root,
          stage,
          expectedRevision: p.revision,
          allowGaps,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  }
  async function replan() {
    setStarting(true);
    setError("");
    try {
      await chain.current;
      if (failedRef.current) return;
      const p = projectRef.current!;
      adopt(
        await invoke<Project>("studio_replan", {
          root: p.root,
          expectedRevision: p.revision,
        }),
      );
      setStep(3);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  }
  async function control(action: string) {
    try {
      await invoke("studio_control_job", { id: jobRef.current?.id, action });
      const p = projectRef.current;
      if (p)
        receiveJob(await invoke<Job | null>("studio_job", { root: p.root }));
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function pickRuntime(pick: boolean) {
    try {
      setRuntimeChecking(true);
      const [nextRuntime, prerequisites] = await Promise.all([
        invoke<Runtime>("studio_runtime", { pick }),
        invoke<RuntimePrerequisites>("studio_runtime_prerequisites"),
      ]);
      setRuntime(nextRuntime);
      setRuntimePrerequisites(prerequisites);
      setRuntimeInstallRoot((value) => value || prerequisites.installRoot);
      setModelInstallRoot((value) => value || prerequisites.modelRoot || prerequisites.defaultModelRoot);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRuntimeChecking(false);
    }
  }
  async function installRuntime() {
    try {
      setRuntimeChecking(true);
      setRuntimeSetup(
        await invoke<RuntimeSetup>("studio_start_runtime_setup", {
          profile: runtimeProfile,
          withText: runtimeTextIndex,
          runtimeRoot: runtimeInstallRoot || null,
          modelRoot: modelInstallRoot || null,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRuntimeChecking(false);
    }
  }
  async function pickSetupFolder(kind: "runtime" | "models") {
    try {
      const folder = await invoke<string | null>("studio_pick_runtime_setup_folder", { kind });
      if (folder) (kind === "runtime" ? setRuntimeInstallRoot : setModelInstallRoot)(folder);
    } catch (e) { setError(errorText(e)); }
  }
  async function cancelRuntimeInstall() {
    try {
      await invoke("studio_cancel_runtime_setup");
      setRuntimeSetup(
        await invoke<RuntimeSetup | null>("studio_runtime_setup_status"),
      );
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function updateApp() {
    try {
      setUpdateState("checking");
      const update = await check();
      if (!update) { setUpdateState("latest"); return; }
      setUpdateVersion(update.version);
      setUpdateState("ready");
      setUpdateState("installing");
      await update.downloadAndInstall();
    } catch (e) { setUpdateState("idle"); setError(`Could not update SyncCut: ${errorText(e)}`); }
  }
  function seek(value: number) {
    setSource(null);
    setTime(value);
    setSeekRequest((v) => v + 1);
  }
  function preview(asset: Asset, start = 0) {
    if (step === 0 && (asset.kind === "video" || asset.kind === "image") && !projectRef.current?.visualIds.includes(asset.id)) {
      change((p) => { p.visualIds.push(asset.id); clearScenes(p); });
    }
    setSourceStart(start);
    setSource({ ...asset });
  }
  function removeSources(ids: string[]) {
    if (busyRef.current) return;
    change((p) => {
      if (ids.includes(p.voiceId ?? "") || ids.includes(p.scriptId ?? "")) {
        if (ids.includes(p.voiceId ?? "")) p.voiceId = null;
        if (ids.includes(p.scriptId ?? "")) p.scriptId = null;
        clearSpeech(p);
      } else if (p.visualIds.some((id) => ids.includes(id))) clearScenes(p);
      p.assets = p.assets.filter((a) => !ids.includes(a.id));
      p.visualIds = p.visualIds.filter((id) => !ids.includes(id));
    });
    if (source && ids.includes(source.id)) setSource(null);
    setSelected((current) => current.filter((id) => !ids.includes(id)));
    setSourceMenu(null);
  }
  function openSourceMenu(event: React.MouseEvent, asset: Asset) {
    event.preventDefault();
    setSourceMenu({ asset, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 188)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 100)) });
  }
  function beginSourceDrag(event: React.PointerEvent, asset: Asset, fromPreview = false) {
    if (event.button !== 0 || busy || step !== 0) return;
    sourceDrag.current = { id: asset.id, x: event.clientX, y: event.clientY, fromPreview };
    document.body.classList.add("sc-dragging-source");
  }
  function saveBeat(beat: Beat) {
    const p = projectRef.current!;
    if (beat.status !== "excluded") {
      if (
        beat.start === null ||
        beat.end === null ||
        beat.start < 0 ||
        beat.end > p.duration ||
        beat.end <= beat.start
      ) {
        setError("Passage boundaries must fit within the recording.");
        return;
      }
      if (
        p.beats.some(
          (b) =>
            b.id !== beat.id &&
            b.status !== "excluded" &&
            b.status !== "review" &&
            b.start !== null &&
            b.end !== null &&
            b.start < beat.end! &&
            b.end > beat.start!,
        )
      ) {
        setError(
          "This passage overlaps an accepted passage. Adjust the boundaries first.",
        );
        return;
      }
    }
    change((p) => {
      p.beats = p.beats.map((b) => (b.id === beat.id ? beat : b));
      p.matches = [];
      p.clips = [];
    });
  }
  function acceptAllNarration() {
    change((p) => {
      p.beats = p.beats.map((b) => b.status === "review" ? { ...b, status: "accepted", issue: "" } : b);
      p.matches = [];
      p.clips = [];
    });
    void start("match");
  }
  function acceptAllVisuals() {
    change((p) => {
      p.clips = p.clips.map((clip) => clip.assetId ? { ...clip, state: "accepted", locked: true } : clip);
    });
    setStep(3);
  }
  function choose(shotId: string) {
    const p = projectRef.current!;
    const clip = p.clips.find((c) => c.id === clipId);
    const shot = p.shots.find((s) => s.id === shotId);
    if (!clip || !shot) return;
    const asset = p.assets.find((a) => a.id === shot.assetId)!;
    const seconds = (clip.end - clip.start) / fpsOf(p);
    if (
      asset.kind === "video" &&
      seconds > shot.sourceOut - shot.sourceIn + 1e-6
    ) {
      setError(
        "This scene is shorter than the selected slot. Split the slot first.",
      );
      return;
    }
    change((next) => {
      const c = next.clips.find((c) => c.id === clipId)!;
      Object.assign(c, {
        assetId: asset.id,
        shotId,
        sourceIn: asset.kind === "image" ? 0 : shot.sourceIn,
        sourceOut: asset.kind === "image" ? 0 : shot.sourceIn + seconds,
        state: "accepted",
        reason: "Selected by editor",
      });
    });
  }
  function split() {
    change((p) => {
      const i = p.clips.findIndex((c) => c.id === clipId);
      const c = p.clips[i];
      const at = Math.round(time * fpsOf(p));
      if (!c || c.locked || at <= c.start || at >= c.end) return;
      const isVideo =
        p.assets.find((a) => a.id === c.assetId)?.kind === "video";
      const cut = c.sourceIn + (at - c.start) / fpsOf(p);
      p.clips.splice(
        i,
        1,
        { ...c, end: at, sourceOut: isVideo ? cut : c.sourceOut },
        {
          ...c,
          id: crypto.randomUUID(),
          start: at,
          sourceIn: isVideo ? cut : c.sourceIn,
        },
      );
    });
  }
  const beat = project?.beats.find((b) => b.id === beatId) ?? project?.beats[0];
  const clip = project?.clips.find((c) => c.id === clipId);
  const row = project?.matches.find(
    (m) => m.beatId === (step === 3 ? clip?.beatId : beat?.id),
  );
  const reviewCount =
    project?.beats.filter((b) => b.status === "review").length ?? 0;
  const gaps = project?.clips.filter((c) => c.state === "gap").length ?? 0;
  const media =
    project?.assets.filter(
      (a) =>
        (a.kind === "video" || a.kind === "image") &&
        project.visualIds.includes(a.id),
    ) ?? [];
  const activeProfile = project?.settings.profile ?? runtimeProfile;
  const runtimeReady = Boolean(
    runtime?.pythonReady &&
      runtime?.binariesReady &&
      ["align_en", "visual", `asr_${activeProfile}`, `vlm_${activeProfile}`].every(
        (key) => runtime.models.some((model) => model.key === key && model.ready),
      ),
  );
  const openFile = (path: string) =>
    openPath(path).catch((e) => setError(errorText(e)));

  return (
    <main className="sc-studio">
      <header className="sc-header">
        <div className="sc-brand">
          SyncCut <span>STUDIO</span>
        </div>
        <div className="sc-project-name">
          {project?.name ?? "Local video editing"}
          {project && (
            <small>
              {saving
                ? "Saving…"
                : saveFailed
                  ? "Unsaved changes"
                  : `Saved · revision ${project.revision}`}
            </small>
          )}
        </div>
        <button
          disabled={starting || job?.status === "running" || saving > 0}
          onClick={openProject}
        >
          Open project
        </button>
        <button
          className={runtimeReady ? "sc-runtime-ready" : ""}
          onClick={() => setRuntimeOpen(true)}
        >
          {runtimeReady ? "AI ready" : "Set up AI"}
        </button>
        <button className="sc-update" disabled={updateState === "checking" || updateState === "installing"} onClick={updateApp}>
          {updateState === "checking" ? "Checking update…" : updateState === "installing" ? `Installing ${updateVersion || "update"}…` : updateState === "latest" ? "App is up to date" : "Update app"}
        </button>
      </header>
      {error && (
        <div role="alert" className="sc-error">
          <span>{error}</span>
          {saveFailed ? (
            <button
              onClick={() => reload().catch((e) => setError(errorText(e)))}
            >
              Reload saved project
            </button>
          ) : (
            <button onClick={() => setError("")}>Dismiss</button>
          )}
        </div>
      )}
      {!project ? (
        <div className="sc-welcome">
          <span className="sc-eyebrow">FROM RECORDING TO ROUGH CUT</span>
          <h1>Your story, matched to your footage.</h1>
          <p>
            Import a voiceover, a script and your source media. Review the
            recording, discover relevant scenes and refine an editable sequence.
          </p>
          <button
            className="sc-primary"
            disabled={starting}
            onClick={openProject}
          >
            Choose a project folder
          </button>
          {!runtimeReady && (
            <button className="sc-welcome-runtime" onClick={() => setRuntimeOpen(true)}>
              Set up local AI first
            </button>
          )}
          <p className="sc-muted">
            Processing stays on this computer. Project data is saved inside the
            selected folder.
          </p>
        </div>
      ) : (
        <>
          <nav className="sc-workflow" aria-label="Editing workflow">
            {steps.map((name, i) => (
              <button
                key={name}
                className={step === i ? "active" : ""}
                onClick={() => setStep(i)}
              >
                <span className="sc-step-number">0{i + 1}</span>
                <span>
                  {name}
                  <small>
                    {i === 0
                      ? `${project.assets.length} sources`
                      : i === 1
                        ? project.beats.length ? `${reviewCount} flagged` : "Awaiting analysis"
                        : i === 2
                          ? `${project.clips.length || project.shots.length} suggestions`
                          : `${project.clips.length} clips · ${gaps} gaps`}
                  </small>
                </span>
              </button>
            ))}
          </nav>
          <div className="sc-workspace">
            <section className="sc-left">
              <div className="sc-panel-head">
                <h2>{steps[step]}</h2>
                <span className="sc-muted">
                  {step === 0
                    ? "Add your narration, script and footage, then analyze once"
                    : step === 1
                      ? "Listen to the narration and approve the AI alignment"
                      : step === 2
                        ? "Keep the visual plan or replace only the scenes you dislike"
                        : "Preview the assembled video and export it to Premiere"}
                </span>
              </div>
              <div className="sc-panel-body">
                {step === 0 && (
                  <>
                    <div className="sc-row">
                      <button
                        className="sc-primary"
                        disabled={busy}
                        onClick={() => importFiles()}
                      >
                        Import files
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setDownloadDir(project.root);
                          setDownloadOpen(true);
                        }}
                      >
                        Download media
                      </button>
                      <button
                        disabled={busy || !selected.length}
                        onClick={() => removeSources(selected)}
                      >
                        Remove selected
                      </button>
                    </div>
                    <label>
                      Voiceover
                      <Dropdown label="Voiceover" disabled={busy} value={project.voiceId ?? ""}
                        options={[{ value: "", label: "Choose recording" }, ...project.assets.filter((a) => a.kind === "voice" || a.kind === "video").map((a) => ({ value: a.id, label: a.name }))]}
                        onChange={(value) => change((p) => { p.voiceId = value || null; clearSpeech(p); })} />
                      <button type="button" className="sc-remove-source" disabled={busy || !project.voiceId} onClick={() => removeSources([project.voiceId!])}>Remove voiceover</button>
                    </label>
                    <label>
                      Script
                      <Dropdown label="Script" disabled={busy} value={project.scriptId ?? ""}
                        options={[{ value: "", label: "Choose script" }, ...project.assets.filter((a) => a.kind === "script").map((a) => ({ value: a.id, label: a.name }))]}
                        onChange={(value) => change((p) => { p.scriptId = value || null; clearSpeech(p); })} />
                      <button type="button" className="sc-remove-source" disabled={busy || !project.scriptId} onClick={() => removeSources([project.scriptId!])}>Remove script</button>
                    </label>
                    <div className="sc-footage-slot">
                      <div className="sc-row sc-between">
                        <strong>Footage</strong>
                        <span className="sc-muted">
                          {media.length} selected
                        </span>
                      </div>
                      <div className="sc-thumbnails">
                        {project.assets.filter((a) => a.kind === "video" || a.kind === "image").map((a) => (
                          <button
                            key={a.id}
                            title="Drag to preview · Right-click for actions"
                            onPointerDown={(e) => beginSourceDrag(e, a)}
                            onContextMenu={(e) => openSourceMenu(e, a)}
                            onClick={() => setSelected([a.id])}
                            onDoubleClick={() => preview(a)}
                          >
                            {a.kind === "image" ? (
                              <img
                                src={safeConvertFileSrc(a.path)}
                                alt={a.name}
                              />
                            ) : (
                              <video
                                src={safeConvertFileSrc(a.path)}
                                preload="auto"
                                muted
                                playsInline
                              />
                            )}
                            <span>{a.name}</span>
                            {project.visualIds.includes(a.id) && <i className="sc-analysis-tick" aria-label="Added to source preview" title="Added to source preview">✓</i>}
                          </button>
                        ))}
                      </div>
                      {!media.length && (
                        <p className="sc-muted">
                          Drag footage into the preview or right-click and choose Add.
                        </p>
                      )}
                    </div>
                    <button
                      className="sc-primary sc-wide"
                      disabled={busy || !project.voiceId || !project.scriptId}
                      onClick={() => start("speech")}
                    >
                      Analyze voice & footage
                    </button>
                  </>
                )}
                {step === 1 && (
                  <>
                    {!project.beats.length ? (
                      <div className="sc-empty sc-guide-card">
                        <strong>Analyze your narration first</strong>
                        <p>Return to Import & Preview, then select a voiceover and script and click Analyze voice & footage.</p>
                        <button onClick={() => setStep(0)}>Go to Import & Preview</button>
                      </div>
                    ) : (
                      <>
                        <div className="sc-guide-card">
                          <strong>{reviewCount ? `${reviewCount} lines need a quick look` : "Narration aligned"}</strong>
                          <p>Press play in the preview to hear the voiceover. The list below contains the script passages aligned by AI; only flagged lines need attention.</p>
                        </div>
                        <div className="sc-beat-list">
                          {project.beats.map((b) => (
                            <button
                              key={b.id}
                              className={`sc-passage ${beat?.id === b.id ? "selected" : ""}`}
                              onClick={() => setBeatId(b.id)}
                              onDoubleClick={() => seek(b.start ?? 0)}
                            >
                              <span className="sc-row sc-between">
                                <span className="sc-mono">
                                  {b.start === null
                                    ? "No timing"
                                    : clock(b.start)}
                                </span>
                                <span className="sc-tag">{b.status}</span>
                              </span>
                              <p>{b.text}</p>
                            </button>
                          ))}
                        </div>
                        {beat?.status === "review" && <details className="sc-runtime-advanced"><summary>Review selected flagged line</summary><BeatEditor key={`${beat.id}:${beat.status}:${beat.text}:${beat.start}:${beat.end}`} beat={beat} disabled={busy} onSave={saveBeat} /></details>}
                        <p className="sc-muted">
                          {reviewCount
                            ? `${reviewCount} passages need review before scene matching.`
                            : "Recording is ready for scene matching."}
                        </p>
                        <div className="sc-row">
                          <button className="sc-primary" disabled={busy || !media.length || !project.beats.some((b) => b.status !== "excluded")} onClick={acceptAllNarration}>Accept all matched narration</button>
                          <button disabled={busy || reviewCount > 0 || !media.length || !project.beats.some((b) => b.status !== "excluded")} onClick={() => start("match")}>Find visual suggestions</button>
                        </div>
                      </>
                    )}
                  </>
                )}
                {step === 2 && (
                  <>
                    {!project.matches.length || !project.clips.length ? (
                      <div className="sc-empty sc-guide-card"><strong>Visual suggestions are being prepared</strong><p>SyncCut will analyze selected footage and create one suggested scene for each narration passage.</p><button disabled={busy || !project.beats.length || !media.length} className="sc-primary" onClick={() => start("match")}>{busy ? "Analyzing footage..." : "Create visual suggestions"}</button></div>
                    ) : (
                      <>
                        <div className="sc-guide-card"><strong>{project.clips.length} visual suggestions ready</strong><p>Click a card to preview that voiceover moment. Keep all suggestions, or select a card and replace it later from the final timeline.</p></div>
                        <div className="sc-clip-list sc-visual-plan">
                          {project.clips.map((item, index) => {
                            const asset = project.assets.find((a) => a.id === item.assetId);
                            const passage = project.beats.find((b) => b.id === item.beatId);
                            const match = project.matches.find((m) => m.beatId === item.beatId);
                            return <button key={item.id} className={`sc-passage ${item.id === clipId ? "selected" : ""}`} onClick={() => { setClipId(item.id); if (asset) preview(asset, item.sourceIn); }}>
                              <span className="sc-row sc-between"><span className="sc-mono">{clock(item.start / fpsOf(project))} - {clock(item.end / fpsOf(project))}</span><span className="sc-tag">{item.state === "gap" ? "Needs a visual" : `${Math.round((match?.candidates[0]?.similarity ?? 0) * 100)}% match`}</span></span>
                              <strong>{index + 1}. {asset?.name ?? "No visual selected"}</strong>
                              <p>{passage?.text ?? item.reason}</p>
                            </button>;
                          })}
                        </div>
                        <div className="sc-row"><button className="sc-primary" disabled={busy} onClick={acceptAllVisuals}>Accept all suggestions</button><button disabled={busy} onClick={() => setStep(3)}>Review final timeline</button></div>
                      </>
                    )}
                  </>
                )}
                {step === 3 && (
                  <>
                    <div className="sc-row">
                      <button
                        disabled={busy || !project.matches.length}
                        onClick={replan}
                      >
                        Rebuild unlocked
                      </button>
                      <button
                        disabled={
                          busy ||
                          !project.clips.length ||
                          (gaps > 0 && !allowGaps)
                        }
                        className="sc-primary"
                        onClick={() => start("export")}
                      >
                        Export to Premiere
                      </button>
                    </div>
                    <label className="sc-check">
                      <input
                        type="checkbox"
                        checked={allowGaps}
                        onChange={(e) => setAllowGaps(e.target.checked)}
                      />
                      Allow empty timeline gaps
                    </label>
                    <div className="sc-clip-list">
                      {project.clips.map((c, i) => (
                        <button
                          key={c.id}
                          className={`sc-passage ${c.id === clipId ? "selected" : ""}`}
                          onClick={() => setClipId(c.id)}
                          onDoubleClick={() => seek(c.start / fpsOf(project))}
                        >
                          <span className="sc-row sc-between">
                            <span className="sc-mono">
                              {clock(c.start / fpsOf(project))} —{" "}
                              {clock(c.end / fpsOf(project))}
                            </span>
                            <span className="sc-tag">
                              {c.locked ? "locked" : c.state}
                            </span>
                          </span>
                          <p>
                            {i + 1}.{" "}
                            {project.assets.find((a) => a.id === c.assetId)
                              ?.name ?? "Empty gap"}
                          </p>
                        </button>
                      ))}
                    </div>
                    {clip && (
                      <div className="sc-editor">
                        <span className="sc-eyebrow">SELECTED CLIP</span>
                        <p>{clip.reason}</p>
                        <div className="sc-row">
                          <button
                            disabled={busy || !clip.assetId}
                            onClick={() =>
                              change((p) => {
                                const c = p.clips.find(
                                  (c) => c.id === clip.id,
                                )!;
                                c.locked = !c.locked;
                                c.state = "accepted";
                              })
                            }
                          >
                            {clip.locked ? "Unlock" : "Keep and lock"}
                          </button>
                          <button
                            disabled={
                              busy ||
                              clip.locked ||
                              time * fpsOf(project) <= clip.start ||
                              time * fpsOf(project) >= clip.end
                            }
                            onClick={split}
                          >
                            Split at playhead
                          </button>
                          <button
                            disabled={busy || clip.locked}
                            onClick={() =>
                              change((p) => {
                                Object.assign(
                                  p.clips.find((c) => c.id === clip.id)!,
                                  {
                                    assetId: null,
                                    shotId: null,
                                    sourceIn: 0,
                                    sourceOut: 0,
                                    state: "gap",
                                    reason: "Cleared by editor",
                                  },
                                );
                              })
                            }
                          >
                            Clear
                          </button>
                        </div>
                        {clip.assetId &&
                          project.assets.find((a) => a.id === clip.assetId)
                            ?.kind === "video" && (
                            <label>
                              Source start · seconds
                              <input
                                key={`${clip.id}:${clip.sourceIn}`}
                                type="number"
                                step="0.01"
                                defaultValue={clip.sourceIn}
                                disabled={busy || clip.locked}
                                onBlur={(e) => {
                                  const value = Number(e.target.value);
                                  const shot = project.shots.find(
                                    (s) => s.id === clip.shotId,
                                  );
                                  const duration =
                                    (clip.end - clip.start) / fpsOf(project);
                                  if (
                                    !shot ||
                                    value < shot.sourceIn ||
                                    value + duration > shot.sourceOut
                                  ) {
                                    e.target.value = String(clip.sourceIn);
                                    setError(
                                      "Source range must stay inside the selected scene.",
                                    );
                                    return;
                                  }
                                  if (value !== clip.sourceIn)
                                    change((p) => {
                                      const c = p.clips.find(
                                        (c) => c.id === clip.id,
                                      )!;
                                      c.sourceIn = value;
                                      c.sourceOut = value + duration;
                                    });
                                }}
                              />
                            </label>
                          )}
                      </div>
                    )}
                    <p className="sc-muted">
                      Export creates frame-conformed editing clips, a stereo
                      voiceover and a Premiere XML. Original sources stay
                      untouched.
                    </p>
                    {project.exportPath && (
                      <button
                        className="sc-wide"
                        onClick={() =>
                          openFile(
                            project.exportPath!.replace(/[\\/][^\\/]+$/, ""),
                          )
                        }
                      >
                        Open export folder
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
            <section className="sc-center">
              <div ref={monitorElement} className={dragGhost?.overPreview ? "sc-preview-drop-target" : ""}>
                <Monitor onSourcePointerDown={(e) => { if (source && (source.kind === "video" || source.kind === "image")) beginSourceDrag(e, source, true); }} step={step} project={project} source={source} sourceStart={sourceStart} onCloseSource={() => setSource(null)} time={time} onTime={setTime} seekRequest={seekRequest} selectedClipId={clipId} onSelectClip={setClipId} />
              </div>
              {step === 3 && clip && (
                <div className="sc-alternatives">
                  <div className="sc-panel-head">
                    <h2>Alternatives for selected slot</h2>
                  </div>
                  <Candidates
                    project={project}
                    candidates={
                      row?.candidates ??
                      project.shots.map((s) => ({
                        shotId: s.id,
                        similarity: 0,
                        verdict: "unreviewed" as const,
                        reason: s.caption,
                        evidenceTimes: [],
                      }))
                    }
                    onPreview={preview}
                    onChoose={choose}
                    disabled={busy || clip.locked}
                  />
                </div>
              )}
            </section>
            <aside className="sc-settings">
              <div className="sc-panel-head">
                <h2>Processing</h2>
              </div>
              <div className="sc-panel-body">
                <label>
                  Model profile
                  <select
                    disabled={busy}
                    value={project.settings.profile}
                    onChange={(e) =>
                      change((p) => {
                        p.settings.profile = e.target.value as
                          | "quality"
                          | "fast";
                        if (p.settings.profile === "quality")
                          p.settings.resource = "focused";
                        clearSpeech(p);
                      })
                    }
                  >
                    <option value="quality">Quality</option>
                    <option value="fast">Fast</option>
                  </select>
                </label>
                <label>
                  Resources
                  <select
                    disabled={busy}
                    value={project.settings.resource}
                    onChange={(e) =>
                      change((p) => {
                        p.settings.resource = e.target.value as
                          | "focused"
                          | "shared";
                        if (
                          p.settings.resource === "shared" &&
                          p.settings.profile !== "fast"
                        ) {
                          p.settings.profile = "fast";
                          clearSpeech(p);
                        }
                      })
                    }
                  >
                    <option value="focused">Focused</option>
                    <option value="shared">Shared</option>
                  </select>
                </label>
                <p className="sc-muted">
                  {project.settings.resource === "shared"
                    ? "Smaller model, limited CPU work. Pause processing to release the GPU."
                    : "One model stage at a time. Close heavy GPU workloads for best throughput."}
                </p>
                <div className="sc-divider" />
                <label>
                  Frame rate
                  <select
                    disabled={busy}
                    value={`${project.settings.fpsNum}/${project.settings.fpsDen}`}
                    onChange={(e) =>
                      change((p) => {
                        const [n, d] = e.target.value.split("/").map(Number);
                        p.settings.fpsNum = n;
                        p.settings.fpsDen = d;
                        p.clips = [];
                      })
                    }
                  >
                    {[
                      ["24000/1001", "23.976"],
                      ["24/1", "24"],
                      ["25/1", "25"],
                      ["30000/1001", "29.97"],
                      ["30/1", "30"],
                      ["60/1", "60"],
                    ].map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Format
                  <select
                    disabled={busy}
                    value={`${project.settings.width}x${project.settings.height}`}
                    onChange={(e) =>
                      change((p) => {
                        [p.settings.width, p.settings.height] = e.target.value
                          .split("x")
                          .map(Number);
                      })
                    }
                  >
                    <option value="1920x1080">1080p</option>
                    <option value="1080x1920">Vertical</option>
                    <option value="3840x2160">4K</option>
                  </select>
                </label>
                <label>
                  Target shot · {project.settings.shotSeconds}s
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="0.5"
                    disabled={busy}
                    value={project.settings.shotSeconds}
                    onChange={(e) =>
                      change((p) => {
                        p.settings.shotSeconds = Number(e.target.value);
                      })
                    }
                  />
                </label>
                <details>
                  <summary>Retrieval settings</summary>
                  <label>
                    Candidates
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={project.settings.topK}
                      disabled={busy}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v >= 1 && v <= 100)
                          change((p) => {
                            p.settings.topK = v;
                            p.settings.rerankK = Math.min(
                              p.settings.rerankK,
                              v,
                            );
                          });
                      }}
                    />
                  </label>
                  <label>
                    Visual checks
                    <input
                      type="number"
                      min="1"
                      max={project.settings.topK}
                      value={project.settings.rerankK}
                      disabled={busy}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v >= 1 && v <= project.settings.topK)
                          change((p) => {
                            p.settings.rerankK = v;
                          });
                      }}
                    />
                  </label>
                </details>
                <div className="sc-divider" />
                <span className="sc-eyebrow">LOCAL MODELS</span>
                <p className="sc-muted">
                  {project.settings.profile === "quality"
                    ? "Whisper large-v3 · Qwen3-VL 8B"
                    : "Distil large-v3.5 · Qwen3-VL 4B"}
                  <br />
                  English CTC alignment
                  <br />
                  SigLIP 2
                </p>
                <button
                  className="sc-wide"
                  onClick={() => setRuntimeOpen(true)}
                >
                  Manage runtime
                </button>
              </div>
            </aside>
          </div>
          <footer className="sc-job">
            <div>
              <strong>{job ? `${job.stage} · ${job.status}` : "Ready"}</strong>
              <p>{job?.message ?? "Import your sources to begin."}</p>
              {job?.status === "running" && (
                <progress
                  max={job.total || 1}
                  value={job.total ? job.done : undefined}
                />
              )}
            </div>
            {job?.status === "running" ? (
              <>
                <button onClick={() => control("pause")}>
                  Pause and release GPU
                </button>
                <button onClick={() => control("cancel")}>Cancel</button>
              </>
            ) : job &&
              ["paused", "interrupted", "failed"].includes(job.status) ? (
              <button disabled={busy} onClick={() => start(job.stage)}>
                Resume from cache
              </button>
            ) : null}
            {job && (
              <button onClick={() => openFile(job.logPath)}>Worker log</button>
            )}
          </footer>
        </>
      )}
      {downloadOpen && project && (
        <YouTubeDownloadModal
          isOpen={downloadOpen}
          outputDir={downloadDir || project.root}
          onClose={() => setDownloadOpen(false)}
          onPickOutputDir={() => {
            invoke<string | null>("pick_directory_output")
              .then((d) => {
                if (d) setDownloadDir(d);
              })
              .catch((e) => setError(errorText(e)));
          }}
          onMediaDownloaded={(a) => {
            void importFiles([a.path]);
          }}
        />
      )}
      {runtimeOpen && (
        <div className="sc-modal-backdrop">
          <section
            className="sc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="runtime-title"
          >
            <div className="sc-panel-head">
              <div>
                <span className="sc-eyebrow">FIRST-RUN ASSISTANT</span>
                <h2 id="runtime-title">Set up local AI</h2>
              </div>
              <button onClick={() => setRuntimeOpen(false)}>Close</button>
            </div>
            <div className="sc-panel-body sc-runtime-wizard">
              <p className="sc-runtime-intro">
                SyncCut can prepare everything automatically. Choose how you
                normally use this computer, then leave the app open while the
                models download.
              </p>

              <div className="sc-runtime-steps" aria-label="Setup progress">
                <span className="active"><b>1</b> Check computer</span>
                <span className={runtimeSetup ? "active" : ""}><b>2</b> Install</span>
                <span className={runtimeSetup?.status === "completed" ? "active" : ""}><b>3</b> Ready</span>
              </div>

              <h3>Choose a model pack</h3>
              <div className="sc-profile-grid">
                <button
                  className={runtimeProfile === "fast" ? "selected" : ""}
                  onClick={() => setRuntimeProfile("fast")}
                  disabled={runtimeSetup?.status === "running"}
                >
                  <strong>Fast · Recommended</strong>
                  <span>Best for RTX 3060 12 GB while Premiere or Chrome is open.</span>
                  <small>Faster processing · lower GPU use</small>
                </button>
                <button
                  className={runtimeProfile === "quality" ? "selected" : ""}
                  onClick={() => setRuntimeProfile("quality")}
                  disabled={runtimeSetup?.status === "running"}
                >
                  <strong>Quality</strong>
                  <span>Use when SyncCut has the GPU to itself.</span>
                  <small>Better model · slower · more VRAM</small>
                </button>
              </div>
              <label className="sc-check sc-runtime-option">
                <input
                  type="checkbox"
                  checked={runtimeTextIndex}
                  disabled={runtimeSetup?.status === "running"}
                  onChange={(e) => setRuntimeTextIndex(e.target.checked)}
                />
                Install optional text search model
                <small>Useful for searching existing captions; not required for the normal workflow.</small>
              </label>

              <div className="sc-runtime-checks">
                <div className={runtimePrerequisites?.gpuReady ? "ready" : "missing"}>
                  <span className="sc-status-dot" />
                  <span><strong>NVIDIA GPU</strong><small>{runtimePrerequisites?.gpuReady ? runtimePrerequisites.gpuDescription : "Not detected · update the NVIDIA driver before processing"}</small></span>
                  <b>{runtimePrerequisites?.gpuReady ? "Detected" : "Check driver"}</b>
                </div>
                <div className={runtimePrerequisites?.pythonReady ? "ready" : "missing"}>
                  <span className="sc-status-dot" />
                  <span><strong>Python 3.11 / 3.12</strong><small>{runtimePrerequisites?.pythonReady ? runtimePrerequisites.pythonPath : "Not found · install 64-bit Python, then check again"}</small></span>
                  <b>{runtimePrerequisites?.pythonReady ? "Ready" : "Action needed"}</b>
                </div>
                <div className={runtimePrerequisites?.mediaReady ? "ready" : "missing"}>
                  <span className="sc-status-dot" />
                  <span><strong>Media tools</strong><small>{runtimePrerequisites?.mediaReady ? "FFmpeg and FFprobe included with SyncCut" : "Files missing · reinstall SyncCut"}</small></span>
                  <b>{runtimePrerequisites?.mediaReady ? "Ready" : "Action needed"}</b>
                </div>
              </div>
              <button className="sc-wide" disabled={runtimeChecking} onClick={() => pickRuntime(false)}>
                {runtimeChecking ? "Checking computer…" : "Check computer again"}
              </button>
              <h3>Choose storage locations</h3>
              {!runtimePrerequisites?.pythonReady && (
                <div className="sc-row">
                  <button onClick={() => openUrl("https://www.python.org/downloads/windows/").catch((e) => setError(errorText(e)))}>Get Python for Windows</button>
                  <span className="sc-muted">Choose Python 3.12 · Windows installer (64-bit).</span>
                </div>
              )}
              <div className="sc-runtime-locations">
                <div>
                  <strong>Local runtime</strong>
                  <small>Stores the private Python environment, AI libraries, FFmpeg and the install log.</small>
                  <p className="sc-path">{runtimeInstallRoot || "Checking…"}</p>
                  <span className="sc-row"><button disabled={runtimeSetup?.status === "running"} onClick={() => pickSetupFolder("runtime")}>Choose folder</button><button disabled={runtimeSetup?.status === "running"} onClick={() => setRuntimeInstallRoot(runtimePrerequisites?.installRoot ?? "")}>Use default</button></span>
                </div>
                <div>
                  <strong>AI models</strong>
                  <small>Stores downloaded model weights. Choose a drive with ample free space if needed.</small>
                  <p className="sc-path">{modelInstallRoot || "Checking…"}</p>
                  <span className="sc-row"><button disabled={runtimeSetup?.status === "running"} onClick={() => pickSetupFolder("models")}>Choose folder</button><button disabled={runtimeSetup?.status === "running"} onClick={() => setModelInstallRoot(runtimePrerequisites?.defaultModelRoot ?? "")}>Use default</button></span>
                </div>
              </div>

              {runtimeSetup && (
                <div className={`sc-setup-result ${runtimeSetup.status}`} role="status">
                  <div className="sc-between sc-row">
                    <strong>{runtimeSetup.status === "running" ? "Installing runtime" : runtimeSetup.status === "completed" ? "Runtime ready" : runtimeSetup.status === "cancelled" ? "Installation cancelled" : "Installation needs attention"}</strong>
                    <span>{runtimeSetup.profile === "fast" ? "Fast" : "Quality"}</span>
                  </div>
                  <p>{runtimeSetup.message}</p>
                  {runtimeSetup.status === "running" && <>
                    <div className="sc-progress-title"><span>{stageLabel(runtimeSetup.stage)}</span><b>{runtimeSetup.totalBytes > 0 ? `${Math.min(100, Math.floor(runtimeSetup.downloadedBytes / runtimeSetup.totalBytes * 100))}%` : "Working…"}</b></div>
                    <progress max={runtimeSetup.totalBytes || undefined} value={runtimeSetup.totalBytes ? runtimeSetup.downloadedBytes : undefined} />
                    {runtimeSetup.totalBytes > 0 ? <div className="sc-progress-metrics"><span><small>Downloaded</small>{bytes(runtimeSetup.downloadedBytes)} / {bytes(runtimeSetup.totalBytes)}</span><span><small>Remaining</small>{bytes(runtimeSetup.remainingBytes)}</span><span><small>Speed</small>{runtimeSetup.bytesPerSecond > 0 ? `${bytes(runtimeSetup.bytesPerSecond)}/s` : "Measuring…"}</span></div> : <small className="sc-muted">Preparing files. Package installers do not provide a reliable byte total.</small>}
                    {runtimeSetup.currentItem && <p className="sc-progress-item">Current model: {runtimeSetup.currentItem}</p>}
                  </>}
                  <div className="sc-row">
                    {runtimeSetup.logPath && <button onClick={() => openFile(runtimeSetup.logPath)}>Open install log</button>}
                    {runtimeSetup.status === "running" && <button onClick={cancelRuntimeInstall}>Cancel installation</button>}
                  </div>
                </div>
              )}

              <button
                className="sc-primary sc-wide sc-install-runtime"
                disabled={
                  runtimeChecking ||
                  !runtimePrerequisites?.pythonReady ||
                  !runtimePrerequisites?.mediaReady ||
                  runtimeSetup?.status === "running" ||
                  job?.status === "running"
                }
                onClick={installRuntime}
              >
                {runtimeSetup?.status === "failed" || runtimeSetup?.status === "cancelled"
                  ? "Continue installation"
                  : runtimeSetup?.status === "completed"
                    ? "Repair / reinstall runtime"
                    : `Install ${runtimeProfile === "fast" ? "Fast" : "Quality"} runtime`}
              </button>

              <details className="sc-runtime-advanced">
                <summary>Advanced: use an existing runtime pack</summary>
                <p className="sc-path">{runtime?.root ?? "No runtime selected"}</p>
                <div className="sc-row">
                  <button disabled={job?.status === "running" || runtimeSetup?.status === "running"} onClick={() => pickRuntime(true)}>Choose existing folder</button>
                  <button onClick={() => pickRuntime(false)}>Check again</button>
                </div>
                <div className="sc-runtime-row"><span>Python</span><span>{runtime?.pythonReady ? "Ready" : "Missing"}</span></div>
                <div className="sc-runtime-row"><span>FFmpeg / FFprobe</span><span>{runtime?.binariesReady ? "Ready" : "Missing"}</span></div>
                {runtime?.models.map((m) => (
                  <div className="sc-runtime-row" key={m.key}><span>{m.name}<small>{m.key}</small></span><span>{m.ready ? "Installed" : "Missing"}</span></div>
                ))}
              </details>
            </div>
          </section>
        </div>
      )}
      {sourceMenu && createPortal(<div ref={sourceMenuRef} role="menu" aria-label="Source actions" className="sc-source-menu" style={{ left: sourceMenu.x, top: sourceMenu.y }} onKeyDown={(e) => { if (e.key === "Escape") setSourceMenu(null); }}>
        {(sourceMenu.asset.kind === "video" || sourceMenu.asset.kind === "image") && <button role="menuitem" disabled={busy} onClick={() => {
          const asset = sourceMenu.asset;
          if (!projectRef.current?.visualIds.includes(asset.id)) change((p) => { p.visualIds.push(asset.id); clearScenes(p); });
          setSelected([asset.id]); preview(asset); setSourceMenu(null);
        }}>Add to preview</button>}
        <button role="menuitem" disabled={busy} onClick={() => removeSources([sourceMenu.asset.id])}>Remove from project</button>
      </div>, document.body)}
      {dragGhost && createPortal(<div className="sc-source-drag-ghost" style={{ left: dragGhost.x + 14, top: dragGhost.y + 14 }}>
        {dragGhost.asset.kind === "image" ? <img src={safeConvertFileSrc(dragGhost.asset.path)} alt="" /> : <video src={safeConvertFileSrc(dragGhost.asset.path)} muted preload="metadata" />}
        <span>{dragGhost.asset.name}</span>
        <small>{dragGhost.fromPreview ? dragGhost.overPreview ? "Move outside preview to deselect" : "Release to deselect" : dragGhost.overPreview ? "Release to add to preview" : "Drop into source preview"}</small>
      </div>, document.body)}
    </main>
  );
}
