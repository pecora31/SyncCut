import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openPath } from "@tauri-apps/plugin-opener";
import { safeConvertFileSrc } from "../utils/mediaUtils";
import { Monitor } from "./Monitor";
import { YouTubeDownloadModal } from "../components/workspace/YouTubeDownloadModal";
import { BeatEditor, Candidates } from "./Review";
import { Asset, Beat, clock, fpsOf, Job, Project, Runtime } from "./types";
import "./studio.css";

const steps = ["Sources", "Recording", "Scenes", "Timeline"] as const;
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
  const [source, setSource] = useState<Asset | null>(null);
  const [sourceStart, setSourceStart] = useState(0);
  const monitorElement = useRef<HTMLDivElement>(null);
  const sourceDrag = useRef<{ id: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [beatId, setBeatId] = useState("");
  const [clipId, setClipId] = useState("");
  const [time, setTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState(0);
  const [allowGaps, setAllowGaps] = useState(false);
  const [search, setSearch] = useState("");
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
            if (j.stage === "match") setStep(3);
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
          p.visualIds.push(...visuals);
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
    };
    const finish = (event: PointerEvent) => {
      const drag = sourceDrag.current;
      sourceDrag.current = null;
      if (
        !drag ||
        Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8
      )
        return;
      const bounds = monitorElement.current?.getBoundingClientRect();
      if (
        !bounds ||
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        return;
      const asset = projectRef.current?.assets.find((a) => a.id === drag.id);
      if (asset) {
        setSelected([asset.id]);
        setSourceStart(0);
        setSource({ ...asset });
      }
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, []);
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
      setRuntime(await invoke<Runtime>("studio_runtime", { pick }));
    } catch (e) {
      setError(errorText(e));
    }
  }
  function seek(value: number) {
    setSource(null);
    setTime(value);
    setSeekRequest((v) => v + 1);
  }
  function preview(asset: Asset, start = 0) {
    setSourceStart(start);
    setSource({ ...asset });
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
  const totalFrames = project
    ? Math.ceil(project.duration * fpsOf(project) - 1e-7)
    : 0;
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
        <button onClick={() => setRuntimeOpen(true)}>Runtime</button>
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
                        ? `${reviewCount} to review`
                        : i === 2
                          ? `${project.shots.length} scenes`
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
                    ? "Select, then double-click to preview"
                    : step === 1
                      ? "Confirm what was actually recorded"
                      : step === 2
                        ? "Inspect evidence before choosing"
                        : "Refine the suggested sequence"}
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
                        onClick={() =>
                          change((p) => {
                            if (
                              selected.includes(p.voiceId ?? "") ||
                              selected.includes(p.scriptId ?? "")
                            ) {
                              p.voiceId = selected.includes(p.voiceId ?? "")
                                ? null
                                : p.voiceId;
                              p.scriptId = selected.includes(p.scriptId ?? "")
                                ? null
                                : p.scriptId;
                              clearSpeech(p);
                            } else if (
                              p.visualIds.some((id) => selected.includes(id))
                            )
                              clearScenes(p);
                            p.assets = p.assets.filter(
                              (a) => !selected.includes(a.id),
                            );
                            p.visualIds = p.visualIds.filter(
                              (id) => !selected.includes(id),
                            );
                            setSource(null);
                            setSelected([]);
                          })
                        }
                      >
                        Remove selected
                      </button>
                    </div>
                    <label>
                      Voiceover
                      <select
                        disabled={busy}
                        value={project.voiceId ?? ""}
                        onChange={(e) =>
                          change((p) => {
                            p.voiceId = e.target.value || null;
                            clearSpeech(p);
                          })
                        }
                      >
                        <option value="">Choose recording</option>
                        {project.assets
                          .filter(
                            (a) => a.kind === "voice" || a.kind === "video",
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Script
                      <select
                        disabled={busy}
                        value={project.scriptId ?? ""}
                        onChange={(e) =>
                          change((p) => {
                            p.scriptId = e.target.value || null;
                            clearSpeech(p);
                          })
                        }
                      >
                        <option value="">Choose script</option>
                        {project.assets
                          .filter((a) => a.kind === "script")
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="sc-footage-slot">
                      <div className="sc-row sc-between">
                        <strong>Footage</strong>
                        <span className="sc-muted">
                          {media.length} selected
                        </span>
                      </div>
                      <div className="sc-thumbnails">
                        {media.slice(0, 4).map((a) => (
                          <button
                            key={a.id}
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
                          </button>
                        ))}
                      </div>
                      {!media.length && (
                        <p className="sc-muted">
                          Import footage, then choose sources below.
                        </p>
                      )}
                    </div>
                    <input
                      aria-label="Search sources"
                      placeholder="Search sources"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className="sc-source-list">
                      {project.assets
                        .filter((a) =>
                          a.name.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((a) => (
                          <div
                            key={a.id}
                            role="button"
                            tabIndex={0}
                            onPointerDown={(e) => {
                              if (
                                e.button === 0 &&
                                !(e.target as Element).closest(
                                  "input,label,button",
                                )
                              )
                                sourceDrag.current = {
                                  id: a.id,
                                  x: e.clientX,
                                  y: e.clientY,
                                };
                            }}
                            className={`sc-source-row ${selected.includes(a.id) ? "selected" : ""}`}
                            onClick={(e) =>
                              setSelected(
                                e.ctrlKey
                                  ? selected.includes(a.id)
                                    ? selected.filter((id) => id !== a.id)
                                    : [...selected, a.id]
                                  : [a.id],
                              )
                            }
                            onDoubleClick={() => preview(a)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") setSelected([a.id]);
                            }}
                          >
                            <div>
                              <strong>{a.name}</strong>
                              <small>
                                {a.kind} · {(a.sizeBytes / 1048576).toFixed(1)}{" "}
                                MB
                              </small>
                            </div>
                            {(a.kind === "video" || a.kind === "image") && (
                              <label
                                className="sc-check"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  disabled={busy}
                                  checked={project.visualIds.includes(a.id)}
                                  onChange={(e) =>
                                    change((p) => {
                                      p.visualIds = e.target.checked
                                        ? [...p.visualIds, a.id]
                                        : p.visualIds.filter(
                                            (id) => id !== a.id,
                                          );
                                      clearScenes(p);
                                    })
                                  }
                                />
                                Use
                              </label>
                            )}
                          </div>
                        ))}
                    </div>
                    <button
                      className="sc-primary sc-wide"
                      disabled={busy || !project.voiceId || !project.scriptId}
                      onClick={() => start("speech")}
                    >
                      Check recording
                    </button>
                  </>
                )}
                {step === 1 && (
                  <>
                    {!project.beats.length ? (
                      <p className="sc-empty">
                        Check your recording from Sources to see timed passages
                        here.
                      </p>
                    ) : (
                      <>
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
                        {beat && (
                          <BeatEditor
                            key={`${beat.id}:${beat.status}:${beat.text}:${beat.start}:${beat.end}`}
                            beat={beat}
                            disabled={busy}
                            onSave={saveBeat}
                          />
                        )}
                        <p className="sc-muted">
                          {reviewCount
                            ? `${reviewCount} passages need review before scene matching.`
                            : "Recording is ready for scene matching."}
                        </p>
                        <button
                          className="sc-primary sc-wide"
                          disabled={
                            busy ||
                            reviewCount > 0 ||
                            !media.length ||
                            !project.beats.some((b) => b.status !== "excluded")
                          }
                          onClick={() => start("match")}
                        >
                          Find scenes
                        </button>
                      </>
                    )}
                  </>
                )}
                {step === 2 && (
                  <>
                    <label>
                      Passage
                      <select
                        value={beat?.id ?? ""}
                        onChange={(e) => setBeatId(e.target.value)}
                      >
                        {project.beats
                          .filter((b) => b.status !== "excluded")
                          .map((b, i) => (
                            <option key={b.id} value={b.id}>
                              {i + 1}. {b.text.slice(0, 70)}
                            </option>
                          ))}
                      </select>
                    </label>
                    {row?.visualBrief && (
                      <p className="sc-brief">{row.visualBrief}</p>
                    )}
                    <Candidates
                      project={project}
                      candidates={row?.candidates ?? []}
                      onPreview={preview}
                      disabled={busy}
                    />
                    <button
                      disabled={busy || !project.matches.length}
                      className="sc-wide"
                      onClick={replan}
                    >
                      Rebuild unlocked timeline
                    </button>
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
              <div ref={monitorElement}>
                <Monitor
                  project={project}
                  source={source}
                  sourceStart={sourceStart}
                  onCloseSource={() => setSource(null)}
                  time={time}
                  onTime={setTime}
                  seekRequest={seekRequest}
                />
              </div>
              <div className="sc-sequence">
                <div className="sc-panel-head">
                  <h2>Sequence</h2>
                  <span className="sc-mono">
                    {clock(project.duration)} ·{" "}
                    {project.settings.fpsNum / project.settings.fpsDen === 30
                      ? "30"
                      : (
                          project.settings.fpsNum / project.settings.fpsDen
                        ).toFixed(2)}{" "}
                    fps
                  </span>
                </div>
                <div
                  className="sc-timeline"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      const box = e.currentTarget.getBoundingClientRect();
                      seek(
                        ((e.clientX - box.left) / box.width) * project.duration,
                      );
                    }
                  }}
                >
                  {project.clips.map((c) => (
                    <button
                      key={c.id}
                      title={`${c.state}: ${c.reason}`}
                      className={`${c.state === "gap" ? "gap" : ""} ${c.id === clipId ? "selected" : ""}`}
                      style={{
                        left: `${(c.start / (totalFrames || 1)) * 100}%`,
                        width: `${((c.end - c.start) / (totalFrames || 1)) * 100}%`,
                      }}
                      onClick={() => {
                        setClipId(c.id);
                        setStep(3);
                      }}
                      onDoubleClick={() => seek(c.start / fpsOf(project))}
                    >
                      {project.assets.find((a) => a.id === c.assetId)?.name ??
                        "Gap"}
                    </button>
                  ))}
                  <div
                    className="sc-playhead"
                    style={{
                      left: `${Math.min(100, (time / (project.duration || 1)) * 100)}%`,
                    }}
                  />
                </div>
                <div className="sc-voice-track">
                  {project.assets.find((a) => a.id === project.voiceId)?.name ??
                    "Voiceover"}
                </div>
                <input
                  aria-label="Sequence playhead"
                  type="range"
                  min="0"
                  max={project.duration || 1}
                  step={1 / fpsOf(project)}
                  value={Math.min(time, project.duration || 1)}
                  onChange={(e) => seek(Number(e.target.value))}
                />
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
              <h2 id="runtime-title">Local runtime</h2>
              <button onClick={() => setRuntimeOpen(false)}>Close</button>
            </div>
            <div className="sc-panel-body">
              <p>
                Choose the runtime pack prepared on the customer computer.
                Models are loaded locally; the editor never downloads them
                automatically.
              </p>
              <p className="sc-path">
                {runtime?.root ?? "No runtime selected"}
              </p>
              <div className="sc-row">
                <button
                  disabled={job?.status === "running"}
                  onClick={() => pickRuntime(true)}
                >
                  Choose runtime folder
                </button>
                <button onClick={() => pickRuntime(false)}>Refresh</button>
              </div>
              <div className="sc-runtime-row">
                <span>Python</span>
                <span>{runtime?.pythonReady ? "Found" : "Missing"}</span>
              </div>
              <div className="sc-runtime-row">
                <span>FFmpeg / FFprobe</span>
                <span>{runtime?.binariesReady ? "Found" : "Missing"}</span>
              </div>
              {runtime?.models.map((m) => (
                <div className="sc-runtime-row" key={m.key}>
                  <span>
                    {m.name}
                    <small>{m.key}</small>
                  </span>
                  <span>{m.ready ? "Installed" : "Missing"}</span>
                </div>
              ))}
              <p className="sc-muted">
                Installation markers indicate a prepared pack. CUDA
                compatibility, peak memory and model output still require
                validation on the target computer.
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
