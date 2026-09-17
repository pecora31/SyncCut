use std::{path::PathBuf, process::Command};
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineResult {
    ok: bool,
    output: String,
}

fn engine_path(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let base = std::env::current_dir().map_err(|e| e.to_string())?;
        return Ok(base.join("engine/synccut.py"));
    }
    app.path()
        .resource_dir()
        .map_err(|e| e.to_string())
        .map(|path| path.join("engine/synccut.py"))
}

#[tauri::command]
fn project_workspace(app: AppHandle) -> Result<String, String> {
    let path = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("projects");
    std::fs::create_dir_all(&path).map_err(|e| format!("Không thể tạo thư mục dữ liệu SyncCut: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn run_engine(app: AppHandle, args: Vec<String>) -> Result<EngineResult, String> {
    let engine = engine_path(&app)?;
    if !engine.is_file() {
        return Err(format!("Không tìm thấy SyncCut engine: {}", engine.display()));
    }
    let result = Command::new("python")
        .arg(engine)
        .args(args)
        .output()
        .map_err(|e| format!("Không thể khởi động Python engine: {e}"))?;
    let output = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr);
    let all_output = if stderr.is_empty() { output } else { format!("{output}\n{stderr}") };
    Ok(EngineResult { ok: result.status.success(), output: all_output })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![run_engine, project_workspace])
        .run(tauri::generate_context!())
        .expect("error while running SyncCut");
}
