pub mod domain;
mod process_tree;
#[cfg(test)]
mod tests;
mod xml;

use domain::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct StudioState {
    pub job: Mutex<Option<Job>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub root: String,
    pub stage: String,
    pub status: String,
    pub message: String,
    pub done: f64,
    pub total: f64,
    pub pid: u32,
    pub revision: i64,
    pub log_path: String,
    #[serde(default)]
    pub export_dir: Option<String>,
    #[serde(default)]
    pub allow_gaps: bool,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn normalize(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    if let Some(unc) = text.strip_prefix("//?/UNC/") {
        format!("//{}", unc)
    } else {
        text.strip_prefix("//?/").unwrap_or(&text).to_string()
    }
}
fn connect(root: &str) -> Result<Connection, String> {
    let directory = Path::new(root).join(".synccut");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let connection =
        Connection::open(directory.join("project.sqlite")).map_err(|e| e.to_string())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    connection.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS project (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, updated INTEGER, document TEXT NOT NULL);").map_err(|e|e.to_string())?;
    Ok(connection)
}
fn read_project(root: &str) -> Result<Project, String> {
    let connection = connect(root)?;
    let data: String = connection
        .query_row("SELECT document FROM project WHERE id=1", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;
    let mut project: Project = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    project.root = normalize(Path::new(root));
    Ok(project)
}
fn write_project(project: &Project, expected: i64) -> Result<(), String> {
    domain::validate(project, false)?;
    let connection = connect(&project.root)?;
    let updated = connection
        .execute(
            "UPDATE project SET revision=?1, document=?2 WHERE id=1 AND revision=?3",
            params![
                project.revision,
                serde_json::to_string(project).map_err(|e| e.to_string())?,
                expected
            ],
        )
        .map_err(|e| e.to_string())?;
    if updated != 1 {
        return Err("Project changed in another window. Reload before continuing.".into());
    }
    Ok(())
}
fn save_job(job: &Job) {
    if let Ok(connection) = connect(&job.root) {
        let _=connection.execute("INSERT INTO jobs(id,updated,document) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated, document=excluded.document",
            params![job.id,now() as i64,serde_json::to_string(job).unwrap_or_default()]);
    }
}
fn config_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let folder = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    Ok(folder.join("studio.json"))
}
fn config(app: &tauri::AppHandle) -> Value {
    config_file(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|v| serde_json::from_str(&v).ok())
        .unwrap_or(json!({}))
}
fn save_config(app: &tauri::AppHandle, value: Value) -> Result<(), String> {
    fs::write(
        config_file(app)?,
        serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn studio_bootstrap(app: tauri::AppHandle) -> Result<Option<Project>, String> {
    if let Some(root) = config(&app)["lastProject"].as_str() {
        if Path::new(root).join(".synccut/project.sqlite").exists() {
            return read_project(root).map(Some);
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn studio_open_project(app: tauri::AppHandle) -> Result<Option<Project>, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Open or create a SyncCut project folder")
        .pick_folder();
    let Some(folder) = picked else {
        return Ok(None);
    };
    let root = normalize(&folder.canonicalize().map_err(|e| e.to_string())?);
    let connection = connect(&root)?;
    let exists: Option<i64> = connection
        .query_row("SELECT revision FROM project WHERE id=1", [], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        let project = Project {
            schema_version: 2,
            id: uuid::Uuid::new_v4().to_string(),
            root: root.clone(),
            name: folder
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            revision: 0,
            assets: vec![],
            voice_id: None,
            script_id: None,
            visual_ids: vec![],
            settings: Settings::default(),
            duration: 0.0,
            words: vec![],
            beats: vec![],
            shots: vec![],
            matches: vec![],
            clips: vec![],
            provenance: Value::Null,
            export_path: None,
        };
        connection
            .execute(
                "INSERT INTO project(id,revision,document) VALUES(1,0,?1)",
                params![serde_json::to_string(&project).map_err(|e| e.to_string())?],
            )
            .map_err(|e| e.to_string())?;
    }
    let mut cfg = config(&app);
    cfg["lastProject"] = json!(root);
    save_config(&app, cfg)?;
    read_project(&root).map(Some)
}

#[tauri::command]
pub fn studio_load_project(root: String) -> Result<Project, String> {
    read_project(&root)
}

#[tauri::command]
pub fn studio_save_project(
    state: tauri::State<StudioState>,
    project: Project,
    expected_revision: i64,
) -> Result<(), String> {
    let job = state.job.lock().map_err(|e| e.to_string())?;
    if job
        .as_ref()
        .is_some_and(|j| j.status == "running" && j.root == project.root)
    {
        return Err("Pause or finish the active job before editing inputs.".into());
    }
    if project.revision != expected_revision + 1 {
        return Err("Invalid project revision.".into());
    }
    write_project(&project, expected_revision)
}

#[tauri::command]
pub fn studio_import(paths: Option<Vec<String>>) -> Result<Vec<Asset>, String> {
    let paths = match paths {
        Some(paths) => paths.into_iter().map(PathBuf::from).collect(),
        None => rfd::FileDialog::new()
            .set_title("Import voiceover, script, footage and images")
            .add_filter(
                "Media and scripts",
                &[
                    "mp4", "mov", "mkv", "avi", "webm", "wav", "mp3", "m4a", "aac", "flac", "ogg",
                    "txt", "md", "srt", "vtt", "jpg", "jpeg", "png", "webp", "bmp",
                ],
            )
            .pick_files()
            .unwrap_or_default(),
    };
    let mut result = vec![];
    let mut seen = std::collections::HashSet::new();
    for path in paths {
        if !path.is_file() {
            return Err(format!("Not a file: {}", path.display()));
        }
        let path = path.canonicalize().map_err(|e| e.to_string())?;
        let normalized = normalize(&path);
        if !seen.insert(normalized.to_lowercase()) {
            continue;
        }
        let extension = path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        let kind = match extension.as_str() {
            "mp4" | "mov" | "mkv" | "avi" | "webm" => "video",
            "wav" | "mp3" | "m4a" | "aac" | "flac" | "ogg" => "voice",
            "txt" | "md" | "srt" | "vtt" => "script",
            "jpg" | "jpeg" | "png" | "webp" | "bmp" => "image",
            _ => return Err(format!("Unsupported file type: {}", path.display())),
        };
        result.push(Asset {
            id: uuid::Uuid::new_v5(
                &uuid::Uuid::NAMESPACE_URL,
                normalized.to_lowercase().as_bytes(),
            )
            .to_string(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            path: normalized,
            kind: kind.into(),
            size_bytes: fs::metadata(&path).map_err(|e| e.to_string())?.len(),
            duration: None,
            fingerprint: None,
            width: 0,
            height: 0,
            fps_num: 0,
            fps_den: 1,
            has_audio: false,
            has_video: false,
            channels: 0,
            sample_rate: 0,
            codec: String::new(),
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn studio_runtime(app: tauri::AppHandle, pick: Option<bool>) -> Result<Value, String> {
    let mut cfg = config(&app);
    if pick.unwrap_or(false) {
        if let Some(root) = rfd::FileDialog::new()
            .set_title("Select SyncCut runtime pack folder")
            .pick_folder()
        {
            cfg["runtimeRoot"] = json!(normalize(&root));
            save_config(&app, cfg.clone())?;
        }
    }
    let root = cfg["runtimeRoot"].as_str().map(PathBuf::from).unwrap_or(
        app.path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("runtime"),
    );
    let mut python = root.join("python").join(if cfg!(windows) {
        "python.exe"
    } else {
        "bin/python3"
    });
    if cfg!(windows) && !python.exists() {
        python = root.join("python/Scripts/python.exe");
    }
    let engine = engine_directory(&app)?;
    let manifest: Value =
        serde_json::from_slice(&fs::read(engine.join("models.json")).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let models: Vec<Value> = manifest["models"]
        .as_object()
        .ok_or("Invalid model manifest.")?
        .iter()
        .map(|(key, m)| {
            let marker = root.join("models").join(key).join("synccut-model.json");
            let installed = fs::read(marker)
                .ok()
                .and_then(|d| serde_json::from_slice::<Value>(&d).ok());
            let ready = installed.as_ref().is_some_and(|v| {
                v["revision"] == m["revision"]
                    && v["repo"] == m["repo"]
                    && v["files"].as_object().is_some_and(|f| {
                        !f.is_empty()
                            && f.iter().all(|(name, size)| {
                                let relative = Path::new(name);
                                !relative.is_absolute()
                                    && !relative
                                        .components()
                                        .any(|c| matches!(c, std::path::Component::ParentDir))
                                    && fs::metadata(root.join("models").join(key).join(relative))
                                        .is_ok_and(|m| {
                                            m.is_file() && Some(m.len()) == size.as_u64()
                                        })
                            })
                    })
            });
            json!({"key":key,"name":m["repo"],"ready":ready})
        })
        .collect();
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    Ok(
        json!({"root":normalize(&root),"pythonPath":normalize(&python),"pythonReady":python.is_file(),
        "binDir":normalize(&root.join("bin")),"binariesReady":root.join(format!("bin/ffmpeg{}",suffix)).is_file() && root.join(format!("bin/ffprobe{}",suffix)).is_file(),
        "modelDir":normalize(&root.join("models")),"engineDir":normalize(&engine),"models":models}),
    )
}
fn engine_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let bundled = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("engine");
    if bundled.join("synccut_engine/worker.py").exists() {
        return Ok(bundled);
    }
    #[cfg(debug_assertions)]
    {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../engine");
        if dev.join("synccut_engine/worker.py").exists() {
            return dev.canonicalize().map_err(|e| e.to_string());
        }
    }
    Err("The packaged SyncCut engine is missing. Reinstall this build.".into())
}

fn hidden(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
}
fn terminate(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Ok(());
    }
    #[cfg(windows)]
    let result = {
        let mut cmd = Command::new("taskkill.exe");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
        hidden(&mut cmd);
        cmd.output()
    };
    #[cfg(not(windows))]
    let result = Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .output();
    let output = result.map_err(|e| format!("Cannot stop worker: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "Worker stop was not confirmed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}
fn publish(app: &tauri::AppHandle, job: &Job) {
    save_job(job);
    let _ = app.emit("studio-job", job);
}

#[tauri::command]
pub fn studio_job(state: tauri::State<StudioState>, root: String) -> Result<Option<Job>, String> {
    let current = state.job.lock().map_err(|e| e.to_string())?;
    if let Some(job) = current.as_ref().filter(|j| j.root == root) {
        return Ok(Some(job.clone()));
    }
    let connection = connect(&root)?;
    let data: Option<String> = connection
        .query_row(
            "SELECT document FROM jobs ORDER BY updated DESC, rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let mut job = data
        .map(|d| serde_json::from_str::<Job>(&d).map_err(|e| e.to_string()))
        .transpose()?;
    if let Some(j) = &mut job {
        if j.status == "running" {
            j.status = "interrupted".into();
            j.message = "Previous session ended. Resume from completed checkpoints.".into();
            j.pid = 0;
            save_job(j);
        }
    }
    Ok(job)
}

#[tauri::command]
pub fn studio_control_job(
    app: tauri::AppHandle,
    state: tauri::State<StudioState>,
    id: String,
    action: String,
) -> Result<(), String> {
    if !["pause", "cancel"].contains(&action.as_str()) {
        return Err("Unknown job action.".into());
    }
    let mut guard = state.job.lock().map_err(|e| e.to_string())?;
    let job = guard
        .as_mut()
        .filter(|j| j.id == id && j.status == "running")
        .ok_or("This job is not running.")?;
    // Only kill the PID owned by the current supervisor; never trust a client-supplied PID.
    terminate(job.pid)?;
    job.pid = 0;
    job.status = if action == "pause" {
        "paused"
    } else {
        "cancelled"
    }
    .into();
    job.message = if action == "pause" {
        "Paused. Worker stopped and GPU memory released; completed checkpoints are retained."
    } else {
        "Cancelled. Project unchanged; completed cache retained."
    }
    .into();
    publish(&app, job);
    Ok(())
}

#[tauri::command]
pub fn studio_replan(
    state: tauri::State<StudioState>,
    root: String,
    expected_revision: i64,
) -> Result<Project, String> {
    let guard = state.job.lock().map_err(|e| e.to_string())?;
    if guard.as_ref().is_some_and(|j| j.status == "running") {
        return Err("Wait for the active job.".into());
    }
    let mut project = read_project(&root)?;
    if project.revision != expected_revision {
        return Err("Project changed; reload it.".into());
    }
    plan(&mut project)?;
    project.revision += 1;
    write_project(&project, expected_revision)?;
    Ok(project)
}

#[tauri::command]
pub fn studio_start_job(
    app: tauri::AppHandle,
    state: tauri::State<StudioState>,
    root: String,
    stage: String,
    expected_revision: i64,
    allow_gaps: Option<bool>,
) -> Result<Job, String> {
    let mut guard = state.job.lock().map_err(|e| e.to_string())?;
    if guard.as_ref().is_some_and(|j| j.status == "running") {
        return Err("Only one GPU job can run at a time.".into());
    }
    if !["speech", "match", "export"].contains(&stage.as_str()) {
        return Err("Unknown stage.".into());
    }
    let project = read_project(&root)?;
    if project.revision != expected_revision {
        return Err("Project changed; reload it.".into());
    }
    validate(&project, stage != "speech")?;
    if project.voice_id.is_none() || project.script_id.is_none() {
        return Err("Assign voiceover and script first.".into());
    }
    if stage == "match" && (project.beats.is_empty() || project.visual_ids.is_empty()) {
        return Err("Review the recording and select footage first.".into());
    }
    if stage == "export" && project.clips.is_empty() {
        return Err("Build a timeline first.".into());
    }
    let runtime = studio_runtime(app.clone(), Some(false))?;
    if runtime["pythonReady"] != true || runtime["binariesReady"] != true {
        return Err(
            "Runtime pack is incomplete. Open Runtime to select the installed pack.".into(),
        );
    }
    let required: Vec<&str> = match stage.as_str() {
        "speech" => vec![
            if project.settings.profile == "fast" {
                "asr_fast"
            } else {
                "asr_quality"
            },
            "align_en",
        ],
        "match" => vec![
            "visual",
            if project.settings.profile == "fast" {
                "vlm_fast"
            } else {
                "vlm_quality"
            },
        ],
        _ => vec![],
    };
    for key in required {
        if !runtime["models"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["key"] == key && m["ready"] == true)
        {
            return Err(format!(
                "Required model '{}' is not installed. Open Runtime.",
                key
            ));
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    let directory = Path::new(&root).join(".synccut/jobs").join(&id);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let resume_export = guard
        .as_ref()
        .filter(|j| {
            j.root == root
                && j.stage == "export"
                && j.revision == project.revision
                && ["paused", "failed", "interrupted"].contains(&j.status.as_str())
        })
        .and_then(|j| j.export_dir.clone());
    let export_dir = if stage == "export" && resume_export.is_some() {
        resume_export
    } else if stage == "export" {
        let parent = rfd::FileDialog::new()
            .set_title("Choose export folder")
            .set_directory(&root)
            .pick_folder()
            .ok_or("Export cancelled.")?;
        Some(normalize(&parent.join(format!(
            "SyncCut-{}-{}",
            now(),
            &id[..8]
        ))))
    } else {
        None
    };
    let request = json!({"schemaVersion":2,"jobId":id,"stage":stage,"project":project,"projectRoot":root,
        "modelDir":runtime["modelDir"],"binDir":runtime["binDir"],"exportDir":export_dir,"allowGaps":allow_gaps.unwrap_or(false)});
    let request_path = directory.join("request.json");
    let output_path = directory.join("result.json");
    fs::write(
        &request_path,
        serde_json::to_vec(&request).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let log_path = directory.join("worker.log");
    let mut command = Command::new(runtime["pythonPath"].as_str().unwrap());
    command
        .arg("-u")
        .arg(Path::new(runtime["engineDir"].as_str().unwrap()).join("launch_worker.py"))
        .arg("--request")
        .arg(&request_path)
        .arg("--output")
        .arg(&output_path)
        .current_dir(runtime["engineDir"].as_str().unwrap())
        .env("PYTHONPATH", runtime["engineDir"].as_str().unwrap())
        .env("PYTHONUTF8", "1")
        .env("HF_HUB_OFFLINE", "1")
        .env("TRANSFORMERS_OFFLINE", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    hidden(&mut command);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Cannot start packaged Python: {}", e))?;
    let process_tree = match process_tree::attach(&child) {
        Ok(handle) => handle,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "Cannot supervise the worker process tree: {}",
                error
            ));
        }
    };
    let job = Job {
        id: id.clone(),
        root: root.clone(),
        stage: stage.clone(),
        status: "running".into(),
        message: "Starting local worker".into(),
        done: 0.0,
        total: 0.0,
        pid: child.id(),
        revision: project.revision,
        log_path: normalize(&log_path),
        export_dir,
        allow_gaps: allow_gaps.unwrap_or(false),
    };
    *guard = Some(job.clone());
    publish(&app, &job);
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let err_thread = std::thread::spawn(move || {
        if let Ok(mut file) = fs::File::create(log_path) {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = writeln!(file, "{}", line);
            }
        }
    });
    let event_app = app.clone();
    let event_id = id.clone();
    let event_thread = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                let state = event_app.state::<StudioState>();
                if let Ok(mut current) = state.job.lock() {
                    if let Some(j) = current
                        .as_mut()
                        .filter(|j| j.id == event_id && j.status == "running")
                    {
                        if let Some(message) = value["message"].as_str() {
                            j.message = message.to_string();
                        }
                        j.done = value["done"].as_f64().unwrap_or(j.done);
                        j.total = value["total"].as_f64().unwrap_or(j.total);
                        publish(&event_app, j);
                    }
                };
            }
        }
    });
    std::thread::spawn(move || {
        let started = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Err(e) => break Err(e.to_string()),
                _ => (),
            }
            if started.elapsed() > Duration::from_secs(6 * 60 * 60) {
                let _ = terminate(child.id());
                let _ = child.kill();
                let _ = child.wait();
                break Err(
                    "Worker exceeded the six-hour job limit; completed checkpoints are retained."
                        .into(),
                );
            }
            std::thread::sleep(Duration::from_millis(200));
        };
        drop(process_tree);
        let _ = event_thread.join();
        let _ = err_thread.join();
        let state = app.state::<StudioState>();
        let Ok(mut current) = state.job.lock() else {
            return;
        };
        let Some(j) = current
            .as_mut()
            .filter(|j| j.id == id && j.status == "running")
        else {
            return;
        };
        j.pid = 0;
        let applied = (|| -> Result<(), String> {
            let status = status?;
            if !status.success() {
                return Err(format!("{}. See worker log: {}", j.message, j.log_path));
            }
            let output: Value =
                serde_json::from_slice(&fs::read(output_path).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            if output["jobId"] != id
                || output["projectRevision"] != project.revision
                || output["schemaVersion"] != 2
            {
                return Err("Worker returned a result for a different request.".into());
            }
            let mut latest = read_project(&root)?;
            if latest.revision != project.revision {
                return Err("Input revision changed; worker result was not applied.".into());
            }
            let result = &output["result"];
            if stage == "export" {
                let path = xml::write(&latest, &result["exportMedia"])?;
                latest.export_path = Some(path);
            } else {
                let mut document = serde_json::to_value(&latest).map_err(|e| e.to_string())?;
                for key in [
                    "assets",
                    "duration",
                    "words",
                    "beats",
                    "shots",
                    "matches",
                    "clips",
                    "provenance",
                ] {
                    if let Some(value) = result.get(key) {
                        document[key] = value.clone();
                    }
                }
                latest = serde_json::from_value(document)
                    .map_err(|e| format!("Invalid worker schema: {}", e))?;
                if stage == "match" {
                    plan(&mut latest)?;
                }
                latest.export_path = None;
            }
            latest.revision += 1;
            write_project(&latest, project.revision)?;
            Ok(())
        })();
        match applied {
            Ok(()) => {
                j.status = "completed".into();
                j.message = if stage == "speech" {
                    "Recording checked. Review passages before matching footage."
                } else if stage == "match" {
                    "Scene suggestions ready. Review the timeline and any gaps."
                } else {
                    "Export complete. Editing media and XML saved together."
                }
                .into();
            }
            Err(error) => {
                j.status = "failed".into();
                j.message = error;
            }
        }
        publish(&app, j);
    });
    Ok(job)
}

pub fn shutdown(app: &tauri::AppHandle) {
    let state = app.state::<StudioState>();
    if let Ok(mut guard) = state.job.lock() {
        if let Some(job) = guard.as_mut().filter(|j| j.status == "running") {
            let _ = terminate(job.pid);
            job.pid = 0;
            job.status = "interrupted".into();
            job.message = "Session closed. Resume from saved checkpoints.".into();
            save_job(job);
        }
    };
}
