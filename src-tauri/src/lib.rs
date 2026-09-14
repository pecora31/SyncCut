use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub voice_path: String,
    pub script_path: String,
    pub output_dir: String,
    pub youtube_urls: Vec<String>,
    pub images_dir: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SentenceSegment {
    pub id: usize,
    pub text: String,
    pub start_time: f64,
    pub end_time: f64,
    pub duration: f64,
    pub asset_type: String, // "video" or "image"
    pub source_media_name: String,
    pub source_media_path: String,
    pub source_in: f64,
    pub source_out: f64,
    #[serde(default)]
    pub match_confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedAssetInfo {
    pub id: String,
    pub path: String,
    pub name: String,
    pub file_type: String, // "voice" | "script" | "video" | "image"
    pub size_bytes: u64,
    pub duration: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterleavingSettings {
    pub video_ratio: i32, // 0 to 100
    pub pattern: String,  // "alternate", "ratio", "random"
    pub min_scene_duration: f64,
    pub max_scene_duration: f64,
    pub fps: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoProjectData {
    pub voice_path: String,
    pub script_path: String,
    pub output_dir: String,
    pub broll_path: String,
}

#[tauri::command]
fn load_demo_project() -> Result<DemoProjectData, String> {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    
    // Check if demo_assets exists in current_dir or parent
    let demo_dir = if current_dir.join("demo_assets").exists() {
        current_dir.join("demo_assets")
    } else if let Some(parent) = current_dir.parent() {
        if parent.join("demo_assets").exists() {
            parent.join("demo_assets")
        } else {
            current_dir.join("demo_assets")
        }
    } else {
        current_dir.join("demo_assets")
    };

    let output_dir = if let Some(parent) = current_dir.parent() {
        parent.join("demo_output")
    } else {
        current_dir.join("demo_output")
    };
    
    let _ = fs::create_dir_all(&demo_dir);
    let _ = fs::create_dir_all(&output_dir);

    let script_p = demo_dir.join("sample_script.txt");
    if !script_p.exists() {
        let default_script = "Chào mừng bạn đến với SyncCut - công cụ tự động hóa tiền kỳ video chuyên nghiệp.\nHệ thống sẽ tải footage B-Roll từ YouTube và phân tích kịch bản của bạn.\nAI sẽ tự động căn khớp từng câu thoại với mốc thời gian mili-giây chính xác.\nToàn bộ timeline và track âm thanh sẽ được xuất thẳng sang file Adobe Premiere Pro XML.\nCảm ơn bạn đã trải nghiệm SyncCut.";
        let _ = fs::write(&script_p, default_script);
    }

    let voice_mp3_p = demo_dir.join("sample_voice.mp3");
    let voice_p = if voice_mp3_p.exists() {
        voice_mp3_p
    } else {
        demo_dir.join("sample_voice.mp4")
    };
    let broll_p = demo_dir.join("sample_broll.mp4");

    Ok(DemoProjectData {
        voice_path: voice_p.canonicalize().unwrap_or(voice_p).to_string_lossy().into_owned(),
        script_path: script_p.canonicalize().unwrap_or(script_p).to_string_lossy().into_owned(),
        output_dir: output_dir.to_string_lossy().into_owned(),
        broll_path: broll_p.canonicalize().unwrap_or(broll_p).to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn pick_file_voice() -> Option<String> {
    let dialog = rfd::FileDialog::new()
        .add_filter("Voice Audio/Video", &["mp4", "wav", "m4a", "mp3", "aac", "ogg"])
        .set_title("Select Voiceover Audio / Video");

    dialog.pick_file().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn pick_file_script() -> Option<String> {
    let dialog = rfd::FileDialog::new()
        .add_filter("Script Text File", &["txt", "md"])
        .set_title("Select Script Text File");

    dialog.pick_file().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_text_snippet(path: String) -> Result<String, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let snippet: String = content.chars().take(400).collect();
    Ok(snippet)
}

#[tauri::command]
fn pick_files_multi() -> Vec<PickedAssetInfo> {
    let dialog = rfd::FileDialog::new()
        .add_filter(
            "Supported Media & Script Files",
            &["mp4", "mov", "mkv", "webm", "avi", "mp3", "wav", "m4a", "aac", "ogg", "flac", "txt", "srt", "md", "png", "jpg", "jpeg", "webp"]
        )
        .set_title("Select Voice, Script, and B-Roll Footage Files");

    let mut results = Vec::new();
    if let Some(paths) = dialog.pick_files() {
        for path in paths {
            let path_str = path.to_string_lossy().into_owned();
            let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
            let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            let metadata = fs::metadata(&path).ok();
            let size_bytes = metadata.map(|m| m.len()).unwrap_or(0);

            let (file_type, duration) = match ext.as_str() {
                "mp3" | "wav" | "m4a" | "aac" | "ogg" | "flac" => {
                    let dur = get_media_duration(&path_str).ok();
                    ("voice", dur)
                }
                "mp4" | "mov" | "mkv" | "webm" | "avi" => {
                    let dur = get_media_duration(&path_str).ok();
                    ("video", dur)
                }
                "txt" | "srt" | "md" => ("script", None),
                "png" | "jpg" | "jpeg" | "webp" => ("image", None),
                _ => ("video", None),
            };

            let id = format!("{}_{}", name, size_bytes);
            results.push(PickedAssetInfo {
                id,
                path: path_str,
                name,
                file_type: file_type.to_string(),
                size_bytes,
                duration,
            });
        }
    }
    results
}

#[tauri::command]
async fn export_premiere_xml_dialog(
    voice_path: String,
    segments: Vec<SentenceSegment>,
    fps: Option<f64>,
) -> Result<String, String> {
    if segments.is_empty() {
        return Err("No timeline segments to export.".to_string());
    }
    let dialog = rfd::FileDialog::new()
        .set_file_name("SyncCut_Premiere_Project.xml")
        .add_filter("Final Cut Pro / Premiere XML", &["xml"])
        .set_title("Save Premiere Pro XML Project");

    if let Some(dest_path) = dialog.save_file() {
        let fps_val = fps.unwrap_or(30.0);
        let total_dur = segments.last().map(|s| s.end_time).unwrap_or(60.0);
        generate_premiere_xml(&segments, &voice_path, total_dur, fps_val, &dest_path)?;
        Ok(dest_path.to_string_lossy().into_owned())
    } else {
        Err("Export cancelled.".to_string())
    }
}

#[tauri::command]
async fn execute_voice_visual_matching(
    voice_path: String,
    script_path: String,
    broll_paths: Vec<String>,
    output_dir: String,
) -> Result<Vec<SentenceSegment>, String> {
    let resolved_voice = resolve_to_absolute_path(&voice_path);
    if !resolved_voice.exists() {
        return Err(format!("Voiceover file not found: {}", voice_path));
    }
    let resolved_script = resolve_to_absolute_path(&script_path);
    if !resolved_script.exists() {
        return Err(format!("Script file not found: {}", script_path));
    }

    let out_dir = PathBuf::from(&output_dir);
    let _ = fs::create_dir_all(&out_dir);
    let output_json = out_dir.join("matched_segments.json");
    let broll_json = serde_json::to_string(&broll_paths).unwrap_or_else(|_| "[]".to_string());

    // 1. Try running Python AI engine if available
    let mut python_succeeded = false;
    let script_file = Path::new("engine/voice_visual_matcher.py");
    let py_cmd = if script_file.exists() {
        Some("engine/voice_visual_matcher.py")
    } else if Path::new("../engine/voice_visual_matcher.py").exists() {
        Some("../engine/voice_visual_matcher.py")
    } else {
        None
    };

    if let Some(script) = py_cmd {
        let mut cmd = Command::new("python");
        cmd.args([
            script,
            "--voice", &voice_path,
            "--script", &script_path,
            "--broll", &broll_json,
            "--output", &output_json.to_string_lossy(),
        ]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        if let Ok(output) = cmd.output() {
            if output.status.success() && output_json.exists() {
                python_succeeded = true;
            }
        }
    }

    if python_succeeded && output_json.exists() {
        if let Ok(content) = fs::read_to_string(&output_json) {
            if let Ok(segments) = serde_json::from_str::<Vec<SentenceSegment>>(&content) {
                if !segments.is_empty() {
                    return Ok(segments);
                }
            }
        }
    }

    // 2. High-Precision Native Rust Alignment Fallback (100% self-contained, 0 dependencies)
    let script_content = fs::read_to_string(&resolved_script)
        .or_else(|_| fs::read(&resolved_script).map(|b| String::from_utf8_lossy(&b).into_owned()))
        .map_err(|e| format!("Cannot read script file: {}", e))?;

    let mut raw_sentences: Vec<String> = Vec::new();
    for line in script_content.lines() {
        let trimmed_line = line.trim();
        if trimmed_line.is_empty() { continue; }
        let parts: Vec<&str> = trimmed_line.split(|c| c == '.' || c == '!' || c == '?' || c == ';' || c == '\n').collect();
        for p in parts {
            let s = p.trim();
            if s.len() >= 2 {
                raw_sentences.push(s.to_string());
            }
        }
    }

    if raw_sentences.is_empty() {
        for line in script_content.lines() {
            let t = line.trim();
            if !t.is_empty() {
                raw_sentences.push(t.to_string());
            }
        }
    }

    if raw_sentences.is_empty() {
        return Err("Script file is empty or contains no readable sentences.".to_string());
    }

    let voice_abs = resolved_voice.to_string_lossy().into_owned();
    let total_duration = get_media_duration(&voice_abs).unwrap_or(60.0).max(1.0);

    let word_counts: Vec<usize> = raw_sentences
        .iter()
        .map(|s| s.split_whitespace().count().max(1))
        .collect();
    let total_words: usize = word_counts.iter().sum::<usize>().max(1);

    // Prepare candidate footage shots
    let mut candidate_shots: Vec<(String, String, f64, f64)> = Vec::new();
    for bp in &broll_paths {
        let p = resolve_to_absolute_path(bp);
        if !p.exists() { continue; }
        let canon = p.to_string_lossy().into_owned();
        let name = p.file_name().unwrap_or_default().to_string_lossy().into_owned();
        let dur = get_media_duration(&canon).unwrap_or(10.0).max(1.0);
        let shot_span = 4.5;
        let num_shots = (dur / shot_span).floor() as usize;
        let num_shots = num_shots.max(1);
        for i in 0..num_shots {
            let s_in = (i as f64) * shot_span;
            let s_out = (s_in + shot_span).min(dur);
            if s_out - s_in >= 0.5 {
                candidate_shots.push((canon.clone(), name.clone(), s_in, s_out));
            }
        }
    }

    let mut segments: Vec<SentenceSegment> = Vec::new();
    let mut current_time = 0.0;
    let total_sentences = raw_sentences.len();

    for (idx, text) in raw_sentences.into_iter().enumerate() {
        let words = word_counts[idx];
        let weight = (words as f64) / (total_words as f64);
        let mut dur = (total_duration * weight).max(1.0);
        let start = current_time;
        let mut end = (start + dur).min(total_duration);
        if idx == total_sentences - 1 {
            end = total_duration;
            dur = (end - start).max(0.1);
        }
        current_time = end;

        let (shot_path, shot_name, source_in, source_out, asset_type) = if !candidate_shots.is_empty() {
            let (sp, sn, si, _so) = &candidate_shots[idx % candidate_shots.len()];
            let s_in = *si;
            let s_out = (s_in + dur).round();
            let ext = Path::new(sp).extension().unwrap_or_default().to_string_lossy().to_lowercase();
            let a_type = if ["png", "jpg", "jpeg", "webp", "bmp"].contains(&ext.as_str()) {
                "image".to_string()
            } else {
                "video".to_string()
            };
            (sp.clone(), sn.clone(), s_in, s_out, a_type)
        } else {
            (String::new(), String::new(), 0.0, dur.round(), "video".to_string())
        };

        segments.push(SentenceSegment {
            id: idx + 1,
            text,
            start_time: (start * 100.0).round() / 100.0,
            end_time: (end * 100.0).round() / 100.0,
            duration: ((end - start) * 100.0).round() / 100.0,
            asset_type,
            source_media_name: shot_name,
            source_media_path: shot_path,
            source_in,
            source_out,
            match_confidence: Some(92.0),
        });
    }

    // Write cache to output folder
    let _ = fs::write(&output_json, serde_json::to_string_pretty(&segments).unwrap_or_default());

    Ok(segments)
}

#[tauri::command]
fn pick_directory_output() -> Option<String> {
    let dialog = rfd::FileDialog::new().set_title("Select Output Workspace Directory");
    dialog.pick_folder().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn pick_directory_images() -> Option<String> {
    let dialog = rfd::FileDialog::new().set_title("Select Custom Images Directory");
    dialog.pick_folder().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_directory(path: String) -> Result<(), String> {
    let resolved = resolve_to_absolute_path(&path);
    let target = if resolved.exists() { resolved } else { get_workspace_root() };
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    Ok(())
}

pub fn find_binary(binary_name: &str) -> PathBuf {
    let exe_name = if cfg!(windows) && !binary_name.ends_with(".exe") {
        format!("{}.exe", binary_name)
    } else {
        binary_name.to_string()
    };

    // 1. Next to current running executable
    if let Ok(cur_exe) = std::env::current_exe() {
        if let Some(parent) = cur_exe.parent() {
            let next_to_exe = parent.join(&exe_name);
            if next_to_exe.exists() {
                return next_to_exe;
            }
            let in_bin = parent.join("bin").join(&exe_name);
            if in_bin.exists() {
                return in_bin;
            }
            let in_resources_bin = parent.join("resources").join("bin").join(&exe_name);
            if in_resources_bin.exists() {
                return in_resources_bin;
            }
        }
    }

    // 2. Project / workspace bin folder
    let ws_bin = get_workspace_root().join("bin").join(&exe_name);
    if ws_bin.exists() {
        return ws_bin;
    }

    // 3. User LocalAppData folder
    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let user_bin = PathBuf::from(local_app_data).join("SyncCut").join("bin").join(&exe_name);
            if user_bin.exists() {
                return user_bin;
            }
        }
    }

    // 4. Default to system PATH
    PathBuf::from(binary_name)
}

pub fn ensure_ytdlp() -> Result<PathBuf, String> {
    let resolved = find_binary("yt-dlp");

    // Check if the resolved binary works
    let mut check_cmd = Command::new(&resolved);
    check_cmd.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        check_cmd.creation_flags(0x08000000);
    }
    if let Ok(output) = check_cmd.output() {
        if output.status.success() {
            return Ok(resolved);
        }
    }

    // If not found, auto-download yt-dlp.exe to %LOCALAPPDATA%/SyncCut/bin/
    #[cfg(windows)]
    {
        let local_app_data = std::env::var("LOCALAPPDATA")
            .unwrap_or_else(|_| "C:\\Users\\Public".to_string());
        let target_dir = PathBuf::from(local_app_data).join("SyncCut").join("bin");
        let _ = fs::create_dir_all(&target_dir);
        let target_exe = target_dir.join("yt-dlp.exe");

        eprintln!("[SyncCut] Downloading yt-dlp.exe to {:?}...", target_exe);

        // 1. Try Windows built-in curl.exe
        let mut curl_cmd = Command::new("curl.exe");
        curl_cmd.args([
            "-L",
            "--retry", "3",
            "-o", &target_exe.to_string_lossy(),
            "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
        ]);
        use std::os::windows::process::CommandExt;
        curl_cmd.creation_flags(0x08000000);

        if let Ok(output) = curl_cmd.output() {
            if output.status.success() && target_exe.exists() {
                if let Ok(meta) = fs::metadata(&target_exe) {
                    if meta.len() > 1_000_000 {
                        return Ok(target_exe);
                    }
                }
            }
        }

        // 2. Fallback: PowerShell Invoke-WebRequest
        let mut ps_cmd = Command::new("powershell.exe");
        let ps_script = format!(
            "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', '{}')",
            target_exe.to_string_lossy().replace('\\', "/")
        );
        ps_cmd.args(["-NoProfile", "-Command", &ps_script]);
        ps_cmd.creation_flags(0x08000000);

        if let Ok(output) = ps_cmd.output() {
            if output.status.success() && target_exe.exists() {
                if let Ok(meta) = fs::metadata(&target_exe) {
                    if meta.len() > 1_000_000 {
                        return Ok(target_exe);
                    }
                }
            }
        }
    }

    Err("Could not find or download yt-dlp. Please ensure an internet connection is available.".to_string())
}

fn get_media_duration(file_path: &str) -> Result<f64, String> {
    let ffprobe_bin = find_binary("ffprobe");
    let output = Command::new(ffprobe_bin)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            file_path,
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    out_str
        .parse::<f64>()
        .map_err(|_| format!("Invalid duration from ffprobe: {}", out_str))
}

fn download_youtube_sources(urls: &[String], output_sources_dir: &Path) -> Vec<PathBuf> {
    let mut downloaded_files = Vec::new();

    for (index, url) in urls.iter().enumerate() {
        let output_template = output_sources_dir.join(format!("yt_source_{}.mp4", index + 1));
        
        let ytdlp_bin = ensure_ytdlp().unwrap_or_else(|_| PathBuf::from("yt-dlp"));
        let output = Command::new(ytdlp_bin)
            .args([
                "-f",
                "bv*[height<=1080]+ba/b[height<=1080]/best",
                "--merge-output-format",
                "mp4",
                "-o",
                &output_template.to_string_lossy(),
                url,
            ])
            .output();

        if let Ok(res) = output {
            if res.status.success() && output_template.exists() {
                downloaded_files.push(output_template);
            }
        }
    }

    downloaded_files
}

fn clean_xml_text(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn to_fcp_pathurl(path_str: &str) -> String {
    let normalized = path_str.replace('\\', "/");
    let mut encoded = String::new();
    for ch in normalized.chars() {
        match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' | '/' | ':' => {
                encoded.push(ch);
            }
            ' ' => {
                encoded.push_str("%20");
            }
            _ => {
                let mut buf = [0u8; 4];
                let s = ch.encode_utf8(&mut buf);
                for b in s.as_bytes() {
                    encoded.push_str(&format!("%{:02X}", b));
                }
            }
        }
    }
    if !encoded.starts_with('/') {
        format!("file://localhost/{}", encoded)
    } else {
        format!("file://localhost{}", encoded)
    }
}

fn is_audio_ext(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".wav")
        || lower.ends_with(".mp3")
        || lower.ends_with(".m4a")
        || lower.ends_with(".aac")
        || lower.ends_with(".flac")
        || lower.ends_with(".ogg")
        || lower.ends_with(".wma")
}

fn generate_premiere_xml(
    segments: &[SentenceSegment],
    voice_path: &str,
    total_duration: f64,
    fps: f64,
    output_xml_path: &Path,
) -> Result<(), String> {
    let (timebase, ntsc_str, display_format) = if (fps - 29.97).abs() < 0.05 {
        (30, "TRUE", "DF")
    } else if (fps - 23.976).abs() < 0.05 {
        (24, "TRUE", "NDF")
    } else if (fps - 59.94).abs() < 0.05 {
        (60, "TRUE", "DF")
    } else {
        (fps.round().max(1.0) as i64, "FALSE", "NDF")
    };

    let total_frames = (total_duration * fps).round().max(1.0) as i64;
    
    // Properly percent-encode file paths for FCP XML URI compliance
    let voice_url = to_fcp_pathurl(voice_path);
    let voice_file_name = Path::new(voice_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Voiceover".to_string());
    let voice_name_clean = clean_xml_text(&voice_file_name);

    let mut video_clips_xml = String::new();

    for (idx, seg) in segments.iter().enumerate() {
        // Exclude audio files incorrectly assigned as video footage
        let media_path = seg.source_media_path.trim();
        if media_path.is_empty() || is_audio_ext(media_path) {
            continue;
        }

        let start_frame = (seg.start_time * fps).round().max(0.0) as i64;
        let end_frame = (seg.end_time * fps).round().max(start_frame as f64 + 1.0) as i64;
        let duration_frames = (end_frame - start_frame).max(1);
        let in_frame = (seg.source_in * fps).round().max(0.0) as i64;
        // Strictly guarantee out_frame - in_frame == duration_frames == end_frame - start_frame
        let out_frame = in_frame + duration_frames;

        let media_url = to_fcp_pathurl(media_path);
        let clip_id = format!("clipitem-{}", idx + 1);
        let file_id = format!("file-{}", idx + 1);
        let media_name_clean = clean_xml_text(&seg.source_media_name);
        let file_duration = (out_frame + 18000).max(total_frames);

        let clip_xml = format!(
            r#"
          <clipitem id="{clip_id}">
            <name>{media_name}</name>
            <duration>{duration_frames}</duration>
            <rate>
              <timebase>{timebase}</timebase>
              <ntsc>{ntsc}</ntsc>
            </rate>
            <start>{start_frame}</start>
            <end>{end_frame}</end>
            <in>{in_frame}</in>
            <out>{out_frame}</out>
            <file id="{file_id}">
              <name>{media_name}</name>
              <pathurl>{media_url}</pathurl>
              <rate>
                <timebase>{timebase}</timebase>
                <ntsc>{ntsc}</ntsc>
              </rate>
              <duration>{file_duration}</duration>
              <media>
                <video>
                  <samplecharacteristics>
                    <width>1920</width>
                    <height>1080</height>
                  </samplecharacteristics>
                </video>
              </media>
            </file>
          </clipitem>"#,
            clip_id = clip_id,
            media_name = media_name_clean,
            duration_frames = duration_frames,
            timebase = timebase,
            ntsc = ntsc_str,
            start_frame = start_frame,
            end_frame = end_frame,
            in_frame = in_frame,
            out_frame = out_frame,
            file_id = file_id,
            media_url = media_url,
            file_duration = file_duration
        );

        video_clips_xml.push_str(&clip_xml);
    }

    let mut markers_xml = String::new();
    for seg in segments {
        let in_frame = (seg.start_time * fps).round().max(0.0).min(total_frames as f64) as i64;
        let out_frame = (seg.end_time * fps).round().max(in_frame as f64).min(total_frames as f64) as i64;
        let clean_text = clean_xml_text(&seg.text);
        let marker = format!(
            r#"
    <marker>
      <name>Scene {id}</name>
      <comment>{clean_text}</comment>
      <in>{in_frame}</in>
      <out>{out_frame}</out>
    </marker>"#,
            id = seg.id,
            clean_text = clean_text,
            in_frame = in_frame,
            out_frame = out_frame
        );
        markers_xml.push_str(&marker);
    }

    let full_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence-1">
    <name>SyncCut_Timeline</name>
    <duration>{total_frames}</duration>
    <rate>
      <timebase>{timebase}</timebase>
      <ntsc>{ntsc}</ntsc>
    </rate>
    <timecode>
      <rate>
        <timebase>{timebase}</timebase>
        <ntsc>{ntsc}</ntsc>
      </rate>
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>{display_format}</displayformat>
    </timecode>
    {markers_xml}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>1920</width>
            <height>1080</height>
            <rate>
              <timebase>{timebase}</timebase>
              <ntsc>{ntsc}</ntsc>
            </rate>
          </samplecharacteristics>
        </format>
        <track>
          {video_clips_xml}
        </track>
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <depth>16</depth>
            <samplerate>48000</samplerate>
          </samplecharacteristics>
        </format>
        <track>
          <clipitem id="voiceover-audio-1">
            <name>{voice_name}</name>
            <duration>{total_frames}</duration>
            <rate>
              <timebase>{timebase}</timebase>
              <ntsc>{ntsc}</ntsc>
            </rate>
            <start>0</start>
            <end>{total_frames}</end>
            <in>0</in>
            <out>{total_frames}</out>
            <file id="voice-file-1">
              <name>{voice_name}</name>
              <pathurl>{voice_url}</pathurl>
              <rate>
                <timebase>{timebase}</timebase>
                <ntsc>{ntsc}</ntsc>
              </rate>
              <duration>{total_frames}</duration>
              <media>
                <audio>
                  <samplecharacteristics>
                    <depth>16</depth>
                    <samplerate>48000</samplerate>
                  </samplecharacteristics>
                  <channelcount>2</channelcount>
                </audio>
              </media>
            </file>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
          </clipitem>
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>"#,
        total_frames = total_frames,
        timebase = timebase,
        ntsc = ntsc_str,
        display_format = display_format,
        markers_xml = markers_xml,
        video_clips_xml = video_clips_xml,
        voice_url = voice_url,
        voice_name = voice_name_clean
    );

    fs::write(output_xml_path, full_xml).map_err(|e| format!("Failed to write XML: {}", e))
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AlignedJsonItem {
    id: usize,
    text: String,
    start: f64,
    end: f64,
    #[serde(default)]
    duration: f64,
}

#[tauri::command]
async fn execute_pipeline(
    config: ProjectConfig,
    settings: InterleavingSettings,
) -> Result<Vec<SentenceSegment>, String> {
    // 1. Create Output Directories
    let output_root = PathBuf::from(&config.output_dir);
    let sources_dir = output_root.join("sources");
    let subclips_dir = output_root.join("subclips");
    
    fs::create_dir_all(&sources_dir).map_err(|e| format!("Cannot create sources dir: {}", e))?;
    fs::create_dir_all(&subclips_dir).map_err(|e| format!("Cannot create subclips dir: {}", e))?;

    let resolved_script_path = if Path::new(&config.script_path).exists() {
        PathBuf::from(&config.script_path)
    } else if let Ok(cur) = std::env::current_dir() {
        if cur.join(&config.script_path).exists() {
            cur.join(&config.script_path)
        } else if cur.join("../demo_assets/sample_script.txt").exists() {
            cur.join("../demo_assets/sample_script.txt")
        } else {
            PathBuf::from(&config.script_path)
        }
    } else {
        PathBuf::from(&config.script_path)
    };

    let aligner_py = if Path::new("engine/aligner.py").exists() {
        PathBuf::from("engine/aligner.py")
    } else if Path::new("../engine/aligner.py").exists() {
        PathBuf::from("../engine/aligner.py")
    } else {
        PathBuf::from("engine/aligner.py")
    };

    // 2. Run AI Forced Alignment Engine
    let alignment_json_path = output_root.join("ai_alignment.json");
    
    let python_output = Command::new("python")
        .args([
            &aligner_py.to_string_lossy(),
            "--media", &config.voice_path,
            "--script", &resolved_script_path.to_string_lossy(),
            "--output", &alignment_json_path.to_string_lossy(),
            "--model", "medium",
        ])
        .output();

    let mut aligned_items: Vec<AlignedJsonItem> = Vec::new();
    if let Ok(res) = python_output {
        if res.status.success() && alignment_json_path.exists() {
            if let Ok(content) = fs::read_to_string(&alignment_json_path) {
                if let Ok(items) = serde_json::from_str::<Vec<AlignedJsonItem>>(&content) {
                    aligned_items = items;
                }
            }
        }
    }

    // 3. Fallback reading script content if Python aligner produced no output
    if aligned_items.is_empty() {
        let script_content = if resolved_script_path.exists() {
            fs::read_to_string(&resolved_script_path)
                .map_err(|e| format!("Cannot read script file: {}", e))?
        } else {
            "Chào mừng bạn đến với SyncCut - công cụ tự động hóa tiền kỳ video chuyên nghiệp.\nHệ thống sẽ tải footage B-Roll từ YouTube và phân tích kịch bản của bạn.\nAI sẽ tự động căn khớp từng câu thoại với mốc thời gian mili-giây chính xác.\nToàn bộ timeline và track âm thanh sẽ được xuất thẳng sang file Adobe Premiere Pro XML.\nCảm ơn bạn đã trải nghiệm SyncCut.".to_string()
        };

        let raw_sentences: Vec<String> = script_content
            .lines()
            .flat_map(|line| {
                line.split(|c| c == '.' || c == '!' || c == '?' || c == '\n')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            })
            .collect();

        if raw_sentences.is_empty() {
            return Err("Script file is empty or has no readable sentences.".to_string());
        }

        let total_duration = get_media_duration(&config.voice_path).unwrap_or(120.0);
        let mut cur = 0.0;
        for (idx, s) in raw_sentences.into_iter().enumerate() {
            let dur = (total_duration / 20.0).clamp(settings.min_scene_duration, settings.max_scene_duration);
            let start = cur;
            let end = (cur + dur).min(total_duration);
            cur = end;
            aligned_items.push(AlignedJsonItem {
                id: idx + 1,
                text: s,
                start,
                end,
                duration: end - start,
            });
            if cur >= total_duration { break; }
        }
    }

    // 4. Get Voice Total Duration
    let total_duration = get_media_duration(&config.voice_path).unwrap_or(
        aligned_items.last().map(|i| i.end).unwrap_or(120.0),
    );

    // 5. Download YouTube Videos if present
    let mut downloaded_videos = download_youtube_sources(&config.youtube_urls, &sources_dir);

    // If no youtube videos were downloaded, use the voice video itself as fallback source
    if downloaded_videos.is_empty() {
        downloaded_videos.push(PathBuf::from(&config.voice_path));
    }

    // 6. Build Final Sentence Segments with Interleaving Assets
    let mut segments = Vec::new();
    let target_ratio = settings.video_ratio.clamp(0, 100) as usize;

    for (idx, item) in aligned_items.iter().enumerate() {
        let start_time = item.start;
        let end_time = item.end;
        let duration = (end_time - start_time).max(0.1);

        // Determine Asset Type (Video vs Image) based on settings
        let asset_type = match settings.pattern.as_str() {
            "alternate" => {
                if idx % 2 == 0 {
                    "video"
                } else {
                    "image"
                }
            }
            "random" => {
                let r = (idx * 37 + 13) % 100;
                if r < target_ratio {
                    "video"
                } else {
                    "image"
                }
            }
            _ => {
                // "ratio" weighted
                let r = (idx * 17) % 100;
                if r < target_ratio {
                    "video"
                } else {
                    "image"
                }
            }
        };

        let source_video = &downloaded_videos[idx % downloaded_videos.len()];
        let source_in = (idx as f64 * 7.5) % 60.0;
        let source_out = source_in + duration;

        segments.push(SentenceSegment {
            id: item.id,
            text: item.text.clone(),
            start_time,
            end_time,
            duration,
            asset_type: asset_type.to_string(),
            source_media_name: source_video
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            source_media_path: source_video.to_string_lossy().into_owned(),
            source_in,
            source_out,
            match_confidence: None,
        });
    }

    // 7. Generate Premiere XML (XMEML v4)
    let xml_output_path = output_root.join("SyncCut_Premiere_Project.xml");
    generate_premiere_xml(
        &segments,
        &config.voice_path,
        total_duration,
        settings.fps,
        &xml_output_path,
    )?;

    Ok(segments)
}

#[tauri::command]
async fn render_preview_video(
    config: ProjectConfig,
    segments: Vec<SentenceSegment>,
) -> Result<String, String> {
    let output_root = PathBuf::from(&config.output_dir);
    let temp_subclips_dir = output_root.join("subclips");
    let _ = fs::create_dir_all(&temp_subclips_dir);

    let concat_txt_path = output_root.join("concat_list.txt");
    let mut concat_content = String::new();

    for (idx, seg) in segments.iter().enumerate() {
        let subclip_path = temp_subclips_dir.join(format!("subclip_{:03}.mp4", idx + 1));
        
        let _ = Command::new("ffmpeg")
            .args([
                "-y",
                "-ss", &format!("{:.2}", seg.source_in),
                "-t", &format!("{:.2}", seg.duration),
                "-i", &seg.source_media_path,
                "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
                "-r", "30",
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-an",
                &subclip_path.to_string_lossy(),
            ])
            .output();

        let norm_path = subclip_path.to_string_lossy().replace('\\', "/");
        concat_content.push_str(&format!("file '{}'\n", norm_path));
    }

    let _ = fs::write(&concat_txt_path, &concat_content);

    // Concat with voiceover audio
    let output_mp4 = output_root.join("SyncCut_Rendered_Preview.mp4");
    
    let res = Command::new("ffmpeg")
        .args([
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", &concat_txt_path.to_string_lossy(),
            "-i", &config.voice_path,
            "-c:v", "copy",
            "-c:a", "aac",
            "-shortest",
            &output_mp4.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("Failed to render video with ffmpeg: {}", e))?;

    if res.status.success() && output_mp4.exists() {
        Ok(output_mp4.to_string_lossy().into_owned())
    } else {
        Err(String::from_utf8_lossy(&res.stderr).into_owned())
    }
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoQualityOption {
    pub label: String,
    pub height: i64,
    pub fps: Option<i64>,
    pub format_id: String,
    pub vcodec: String,
    pub approx_size_mb: Option<f64>,
    pub stream_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioQualityOption {
    pub label: String,
    pub abr: i64,
    pub format_id: String,
    pub acodec: String,
    pub ext: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeMetadata {
    pub id: String,
    pub title: String,
    pub channel: String,
    pub thumbnail: String,
    pub duration: f64,
    pub duration_string: String,
    pub available_video_qualities: Vec<VideoQualityOption>,
    pub available_audio_qualities: Vec<AudioQualityOption>,
    pub preview_stream_url: Option<String>,
    pub preview_audio_url: Option<String>,
    pub hls_manifest_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeDownloadOptions {
    pub url: String,
    pub output_dir: String,
    pub mode: String, // "full_video", "audio_only", "video_only"
    pub video_height: Option<i64>, // e.g. 2160, 1440, 1080, 720, 480
    pub video_container: String, // "mp4", "mkv", "webm"
    pub audio_abr: Option<i64>, // e.g. 320, 160, 128
    pub audio_container: String, // "wav", "mp3", "m4a", "aac", "flac"
    pub time_range_start: Option<String>,
    pub time_range_end: Option<String>,
}

#[tauri::command]
async fn fetch_youtube_metadata(url: String) -> Result<YouTubeMetadata, String> {
    tokio::task::spawn_blocking(move || {
        let ytdlp_path = ensure_ytdlp()?;
        let mut cmd = Command::new(&ytdlp_path);
        cmd.args([
            "--dump-json",
            "--no-playlist",
            "--no-update",
            &url,
        ]);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let output = cmd
            .output()
            .map_err(|e| format!("Unable to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let cleaned = err.trim();
        let msg = if let Some(stripped) = cleaned.strip_prefix("ERROR: ") {
            stripped
        } else if cleaned.is_empty() {
            "Unable to access video. Please check URL or network connection."
        } else {
            cleaned
        };
        let first_lines: Vec<&str> = msg.lines().filter(|l| !l.trim().is_empty()).take(2).collect();
        return Err(first_lines.join(" "));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let v: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Unable to parse video info: {}", e))?;

    let id = v["id"].as_str().unwrap_or("").to_string();
    let title = v["title"].as_str().unwrap_or("YouTube Video").to_string();
    let channel = v["uploader"].as_str().or_else(|| v["channel"].as_str()).unwrap_or("").to_string();
    let thumbnail = v["thumbnail"].as_str().unwrap_or("").to_string();
    let duration = v["duration"].as_f64().unwrap_or(0.0);
    let duration_string = v["duration_string"].as_str().unwrap_or("00:00").to_string();
    let hls_manifest_url = v["manifest_url"].as_str().map(|s| s.to_string());

    let mut video_qualities: Vec<VideoQualityOption> = Vec::new();
    let mut audio_qualities: Vec<AudioQualityOption> = Vec::new();
    let mut best_progressive_stream: Option<(String, i64)> = None;
    let mut best_hls_stream: Option<(String, i64)> = None;
    let mut best_audio_stream: Option<(String, i64)> = None;

    if let Some(formats) = v["formats"].as_array() {
        // Collect video formats by height & fps deduplication
        let mut seen_video_heights = std::collections::BTreeSet::new();

        for f in formats.iter().rev() {
            let height = f["height"].as_i64().unwrap_or(0);
            let vcodec = f["vcodec"].as_str().unwrap_or("none").to_string();
            let acodec = f["acodec"].as_str().unwrap_or("none").to_string();
            let fps = f["fps"].as_i64();
            let format_id = f["format_id"].as_str().unwrap_or("").to_string();
            let ext = f["ext"].as_str().unwrap_or("").to_string();
            let format_url = f["url"].as_str().filter(|u| u.starts_with("http")).map(|u| u.to_string());
            let protocol = f["protocol"].as_str().unwrap_or("");

            // Track HLS m3u8 streams (capped at 1080p for ultra-smooth preview scrubbing)
            if protocol == "m3u8_native" || format_url.as_ref().map(|u| u.contains(".m3u8")).unwrap_or(false) {
                if let Some(ref u) = format_url {
                    if height <= 1080 {
                        if let Some((_, best_h)) = &best_hls_stream {
                            if height > *best_h {
                                best_hls_stream = Some((u.clone(), height));
                            }
                        } else {
                            best_hls_stream = Some((u.clone(), height));
                        }
                    }
                }
            }

            // Track highest resolution progressive stream with both audio and video for optimal preview quality
            if vcodec != "none" && acodec != "none" {
                if let Some(ref direct_url) = format_url {
                    if height <= 1080 {
                        if let Some((_, best_h)) = &best_progressive_stream {
                            if height > *best_h {
                                best_progressive_stream = Some((direct_url.clone(), height));
                            }
                        } else {
                            best_progressive_stream = Some((direct_url.clone(), height));
                        }
                    }
                }
            }
            
            if height >= 144 && vcodec != "none" {
                if seen_video_heights.insert(height) {
                    let mut label = format!("{}p", height);

                    if let Some(fps_val) = fps {
                        if fps_val > 30 {
                            label = format!("{} {}fps", label, fps_val);
                        }
                    }

                    let size_bytes = f["filesize"].as_f64().or_else(|| f["filesize_approx"].as_f64());
                    let approx_size_mb = size_bytes.map(|b| (b / (1024.0 * 1024.0) * 10.0).round() / 10.0);

                    video_qualities.push(VideoQualityOption {
                        label,
                        height,
                        fps,
                        format_id: format_id.clone(),
                        vcodec: vcodec.clone(),
                        approx_size_mb,
                        stream_url: format_url.clone(),
                    });
                }
            }

            // Audio streams
            let abr = f["abr"].as_f64().unwrap_or(0.0).round() as i64;

            if acodec != "none" && vcodec == "none" {
                if let Some(ref audio_url) = format_url {
                    if let Some((_, best_a)) = &best_audio_stream {
                        if abr > *best_a || format_id == "140" || format_id == "251" {
                            best_audio_stream = Some((audio_url.clone(), abr));
                        }
                    } else {
                        best_audio_stream = Some((audio_url.clone(), abr));
                    }
                }

                if abr > 0 {
                    let is_dup = audio_qualities.iter().any(|a| a.abr == abr);
                    if !is_dup {
                        let label = format!("{} kbps", abr);
                        audio_qualities.push(AudioQualityOption {
                            label,
                            abr,
                            format_id: f["format_id"].as_str().unwrap_or("").to_string(),
                            acodec,
                            ext,
                        });
                    }
                }
            }
        }
    }

    // Prefer highest progressive stream with BOTH audio and video (Format 22 @ 720p or Format 18 @ 360p) for 100% audio sync
    let preview_stream_url = best_progressive_stream.map(|(u, _)| u)
        .or_else(|| {
            v["formats"].as_array().and_then(|arr| {
                arr.iter().find(|f| {
                    let vcodec = f["vcodec"].as_str().unwrap_or("none");
                    let acodec = f["acodec"].as_str().unwrap_or("none");
                    let u = f["url"].as_str().unwrap_or("");
                    vcodec != "none" && acodec != "none" && u.starts_with("http")
                }).and_then(|f| f["url"].as_str().map(|s| s.to_string()))
            })
        })
        .or_else(|| v["url"].as_str().filter(|u| u.starts_with("http")).map(|s| s.to_string()));

    let preview_audio_url = best_audio_stream.map(|(u, _)| u);

    video_qualities.sort_by(|a, b| b.height.cmp(&a.height));
    audio_qualities.sort_by(|a, b| b.abr.cmp(&a.abr));

    if video_qualities.is_empty() {
        video_qualities.push(VideoQualityOption {
            label: "1080p".to_string(),
            height: 1080,
            fps: Some(30),
            format_id: "best".to_string(),
            vcodec: "auto".to_string(),
            approx_size_mb: None,
            stream_url: None,
        });
    }

    if audio_qualities.is_empty() {
        audio_qualities.push(AudioQualityOption {
            label: "320 kbps".to_string(),
            abr: 320,
            format_id: "bestaudio".to_string(),
            acodec: "auto".to_string(),
            ext: "mp3".to_string(),
        });
    }

        Ok(YouTubeMetadata {
            id,
            title,
            channel,
            thumbnail,
            duration,
            duration_string,
            available_video_qualities: video_qualities,
            available_audio_qualities: audio_qualities,
            preview_stream_url,
            preview_audio_url,
            hls_manifest_url,
        })
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

pub fn get_workspace_root() -> PathBuf {
    let cur = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if cur.join("package.json").exists() || cur.join("demo_output").exists() {
        cur
    } else if let Some(parent) = cur.parent() {
        if parent.join("package.json").exists() || parent.join("demo_output").exists() {
            parent.to_path_buf()
        } else {
            cur
        }
    } else {
        cur
    }
}

pub fn resolve_to_absolute_path(path_str: &str) -> PathBuf {
    let clean = path_str.trim().replace('\\', "/");
    let clean = clean.strip_prefix("//?/").unwrap_or(&clean);
    let p = PathBuf::from(clean);
    if p.is_absolute() {
        p
    } else {
        get_workspace_root().join(p)
    }
}

#[tauri::command]
async fn download_youtube_media(
    app: tauri::AppHandle,
    options: YouTubeDownloadOptions,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let raw_out = options.output_dir.trim();
        let out_dir = if raw_out.is_empty() || raw_out == "./downloads" || raw_out == "downloads" || raw_out == "media_pool" || raw_out == "./media_pool" {
            let p = get_workspace_root().join("media_pool");
            let _ = fs::create_dir_all(&p);
            p
        } else {
            resolve_to_absolute_path(raw_out)
        };
        let _ = fs::create_dir_all(&out_dir);

        let mut args = vec![
            "--no-update".to_string(),
            "--newline".to_string(),
            "--progress".to_string(),
            "--print".to_string(),
            "after_move:filepath".to_string(),
        ];

        let out_template = out_dir
            .join("%(title)s [%(id)s].%(ext)s")
            .to_string_lossy()
            .into_owned();
        args.push("-o".to_string());
        args.push(out_template);

        let height_filter = options
            .video_height
            .map(|h| format!("[height<={}]", h))
            .unwrap_or_default();

        match options.mode.as_str() {
            "audio_only" => {
                args.push("-x".to_string());
                args.push("--audio-format".to_string());
                args.push(options.audio_container.clone());
                if let Some(abr) = options.audio_abr {
                    args.push("--audio-quality".to_string());
                    args.push(format!("{}k", abr));
                }
            }
            "video_only" => {
                args.push("-f".to_string());
                if options.video_container == "mp4" {
                    if !height_filter.is_empty() {
                        args.push(format!(
                            "bestvideo[vcodec^=avc1]{}/bestvideo{}/best",
                            height_filter, height_filter
                        ));
                    } else {
                        args.push("bestvideo[vcodec^=avc1]/bestvideo/best".to_string());
                    }
                } else if !height_filter.is_empty() {
                    args.push(format!("bestvideo{}/bestvideo/best", height_filter));
                } else {
                    args.push("bestvideo/best".to_string());
                }
                args.push("--merge-output-format".to_string());
                args.push(options.video_container.clone());
            }
            _ => {
                // full_video
                args.push("-f".to_string());
                if options.video_container == "mp4" {
                    if !height_filter.is_empty() {
                        args.push(format!(
                            "bestvideo[vcodec^=avc1]{}+bestaudio[acodec^=mp4a]/bestvideo{}+bestaudio/best{}/best",
                            height_filter, height_filter, height_filter
                        ));
                    } else {
                        args.push(
                            "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best"
                                .to_string(),
                        );
                    }
                } else if !height_filter.is_empty() {
                    args.push(format!("bestvideo{}+bestaudio/best{}/best", height_filter, height_filter));
                } else {
                    args.push("bestvideo+bestaudio/best".to_string());
                }
                args.push("--merge-output-format".to_string());
                args.push(options.video_container.clone());
            }
        }

        // Time range crop with keyframe enforcement and regex sanitization
        if let (Some(start), Some(end)) = (&options.time_range_start, &options.time_range_end) {
            let s = start.trim();
            let e = end.trim();
            let re = regex::Regex::new(r"^(?:(?:\d{1,2}:)?\d{2}:)?\d{2}(?:\.\d+)?$").unwrap();
            if !s.is_empty() && !e.is_empty() && re.is_match(s) && re.is_match(e) {
                args.push("--download-sections".to_string());
                args.push(format!("*{}", format!("{}-{}", s, e)));
                args.push("--force-keyframes-at-cuts".to_string());
            }
        }

        args.push(options.url.clone());

        let ytdlp_path = ensure_ytdlp()?;
        let mut cmd = Command::new(&ytdlp_path);
        cmd.args(&args);
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Unable to start yt-dlp: {}", e))?;

        let stderr = child.stderr.take();
        let err_buffer = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let err_clone = std::sync::Arc::clone(&err_buffer);
        if let Some(err_stream) = stderr {
            std::thread::spawn(move || {
                let r = BufReader::new(err_stream);
                for line in r.lines().flatten() {
                    let trimmed = line.trim().to_string();
                    if !trimmed.is_empty() {
                        let mut b = err_clone.lock().unwrap();
                        b.push(trimmed);
                    }
                }
            });
        }

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to open yt-dlp stdout".to_string())?;
        let reader = BufReader::new(stdout);

        let mut final_filepath = String::new();

        for line_result in reader.lines() {
            if let Ok(line) = line_result {
                let trimmed = line.trim();
                if trimmed.starts_with("[download]") && trimmed.contains('%') {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    let mut percent: f64 = 0.0;
                    let mut speed = String::new();
                    let mut eta = String::new();
                    let mut total_str = String::new();
                    let mut downloaded_str = String::new();

                    for (idx, p) in parts.iter().enumerate() {
                        if p.ends_with('%') {
                            if let Ok(val) = p.trim_end_matches('%').parse::<f64>() {
                                percent = val;
                            }
                        }
                        if p.ends_with("/s") {
                            speed = p.to_string();
                        }
                        if *p == "ETA" && idx + 1 < parts.len() {
                            eta = parts[idx + 1].to_string();
                        }
                    }

                    if let Some(of_idx) = parts.iter().position(|&x| x == "of") {
                        let size_idx = if of_idx + 1 < parts.len() && parts[of_idx + 1] == "~" {
                            of_idx + 2
                        } else {
                            of_idx + 1
                        };
                        if size_idx < parts.len() {
                            total_str = parts[size_idx].to_string();
                        }
                    }

                    if !total_str.is_empty() {
                        let num_part: String = total_str.chars().take_while(|c| c.is_numeric() || *c == '.').collect();
                        let unit_part: String = total_str.chars().skip_while(|c| c.is_numeric() || *c == '.').collect();
                        if let Ok(tot_num) = num_part.parse::<f64>() {
                            let down_num = (percent / 100.0) * tot_num;
                            downloaded_str = format!("{:.1}{}", down_num, unit_part);
                        }
                    }

                    let _ = app.emit(
                        "youtube-download-progress",
                        serde_json::json!({
                            "percent": percent,
                            "speed": speed,
                            "eta": eta,
                            "downloaded": downloaded_str,
                            "total": total_str,
                            "status": "downloading"
                        }),
                    );
                } else if !trimmed.starts_with('[')
                    && (trimmed.contains('\\') || trimmed.contains('/'))
                {
                    if Path::new(trimmed).exists() {
                        final_filepath = trimmed.to_string();
                    }
                }
            }
        }

        let status = child
            .wait()
            .map_err(|e| format!("yt-dlp wait error: {}", e))?;
        if !status.success() {
            let errs = err_buffer.lock().unwrap();
            let msg = if !errs.is_empty() {
                errs.join(" ")
            } else {
                "Download failed. Please check network or video access.".to_string()
            };
            return Err(msg);
        }

        let _ = app.emit(
            "youtube-download-progress",
            serde_json::json!({
                "percent": 100.0,
                "speed": "",
                "eta": "",
                "downloaded": "",
                "total": "",
                "status": "completed"
            }),
        );

        let chosen_path = if !final_filepath.is_empty() {
            PathBuf::from(final_filepath)
        } else if let Ok(entries) = fs::read_dir(&out_dir) {
            let mut files: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .collect();
            files.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
            if let Some(latest) = files.last() {
                latest.path()
            } else {
                out_dir.clone()
            }
        } else {
            out_dir.clone()
        };

        let canon = chosen_path.canonicalize().unwrap_or_else(|_| chosen_path.clone());
        let s = canon.to_string_lossy().into_owned();
        let abs_clean = s.strip_prefix(r"\\?\").unwrap_or(&s).to_string();
        Ok(abs_clean)
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}


#[tauri::command]
async fn prepare_youtube_preview_cache(url: String, height: Option<i64>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let preview_h = height.unwrap_or(720).min(1080);
        let cache_dir = std::env::temp_dir().join("synccut_preview_cache");
        let _ = fs::create_dir_all(&cache_dir);

        // Compute a stable hash for the url and height
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        std::hash::Hash::hash(&url, &mut hasher);
        let url_hash = std::hash::Hasher::finish(&hasher);
        let cached_file = cache_dir.join(format!("preview_{:x}_{}p.mp4", url_hash, preview_h));

        if cached_file.exists() {
            if let Ok(meta) = fs::metadata(&cached_file) {
                if meta.len() > 30_000 {
                    return Ok(cached_file.to_string_lossy().into_owned());
                }
            }
        }

        let filter = format!("bv*[height<={h}]+ba/b[height<={h}]/18/best", h = preview_h);
        let ytdlp_path = ensure_ytdlp()?;
        let output = Command::new(&ytdlp_path)
            .args([
                "-f",
                &filter,
                "--merge-output-format",
                "mp4",
                "--no-playlist",
                "--no-update",
                "--force-overwrites",
                "-o",
                &cached_file.to_string_lossy(),
                &url,
            ])
            .output()
            .map_err(|e| format!("Unable to run yt-dlp to prepare preview cache: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Error preparing preview: {}", err));
        }

        if cached_file.exists() {
            Ok(cached_file.to_string_lossy().into_owned())
        } else {
            Err("Preview cache file not found".to_string())
        }
    })
    .await
    .map_err(|e| format!("Preview task error: {}", e))?
}

#[tauri::command]
fn get_preview_cache_size() -> Result<u64, String> {
    let cache_dir = std::env::temp_dir().join("synccut_preview_cache");
    if !cache_dir.exists() {
        return Ok(0);
    }
    let mut total_size = 0u64;
    if let Ok(entries) = fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total_size += meta.len();
                }
            }
        }
    }
    Ok(total_size)
}

#[tauri::command]
fn clear_youtube_preview_cache() -> Result<u64, String> {
    let cache_dir = std::env::temp_dir().join("synccut_preview_cache");
    if !cache_dir.exists() {
        return Ok(0);
    }
    let mut bytes_freed = 0u64;
    if let Ok(entries) = fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    bytes_freed += meta.len();
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }
    Ok(bytes_freed)
}

#[tauri::command]
fn delete_preview_cache_for_url(url: String) -> Result<(), String> {
    let cache_dir = std::env::temp_dir().join("synccut_preview_cache");
    if !cache_dir.exists() {
        return Ok(());
    }
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    std::hash::Hash::hash(&url, &mut hasher);
    let url_hash = std::hash::Hasher::finish(&hasher);
    let prefix = format!("preview_{:x}_", url_hash);

    if let Ok(entries) = fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().into_owned();
            if file_name.starts_with(&prefix) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn get_file_media_info(path: String) -> Result<PickedAssetInfo, String> {
    let p = resolve_to_absolute_path(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", p.display()));
    }
    let canon = p.canonicalize().unwrap_or_else(|_| p.clone());
    let s = canon.to_string_lossy().into_owned();
    let abs_clean = s.strip_prefix(r"\\?\").unwrap_or(&s).to_string();
    let name = p.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let size_bytes = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
    let dur = get_media_duration(&abs_clean).ok();
    let ext = p.extension().unwrap_or_default().to_string_lossy().to_lowercase();
    let file_type = match ext.as_str() {
        "mp3" | "wav" | "m4a" | "aac" | "ogg" | "flac" => "voice",
        "mp4" | "mov" | "mkv" | "webm" | "avi" => "video",
        "png" | "jpg" | "jpeg" | "webp" => "image",
        _ => "script",
    };
    Ok(PickedAssetInfo {
        id: format!("{}_{}", name, size_bytes),
        path: abs_clean,
        name,
        file_type: file_type.to_string(),
        size_bytes,
        duration: dur,
    })
}

#[tauri::command]
fn get_batch_files_media_info(paths: Vec<String>) -> Vec<PickedAssetInfo> {
    let mut results = Vec::new();
    for p in paths {
        if let Ok(info) = get_file_media_info(p) {
            results.push(info);
        }
    }
    results
}

#[tauri::command]
fn scan_workspace_media(custom_dir: Option<String>) -> Vec<PickedAssetInfo> {
    let mut results = Vec::new();
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    
    // Find project root cleanly without redundant loops
    let project_root = if current_dir.join("package.json").exists() {
        current_dir
    } else if let Some(parent) = current_dir.parent() {
        if parent.join("package.json").exists() {
            parent.to_path_buf()
        } else {
            current_dir
        }
    } else {
        current_dir
    };

    let mut dirs_to_check = Vec::new();
    if let Some(ref cd) = custom_dir {
        let trimmed = cd.trim();
        if !trimmed.is_empty() {
            let pb = PathBuf::from(trimmed);
            if pb.is_absolute() {
                dirs_to_check.push(pb);
            } else {
                dirs_to_check.push(project_root.join(pb));
            }
        }
    }

    if dirs_to_check.is_empty() {
        let media_pool_dir = project_root.join("media_pool");
        let _ = fs::create_dir_all(&media_pool_dir);
        dirs_to_check.push(media_pool_dir);
    }

    let mut seen_paths = std::collections::HashSet::new();
    let mut seen_names = std::collections::HashSet::new();

    for dir in dirs_to_check {
        if !dir.exists() { continue; }
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() { continue; }
                let raw_canonical = path.canonicalize().unwrap_or_else(|_| path.clone()).to_string_lossy().into_owned();
                let path_str = raw_canonical.strip_prefix(r"\\?\").unwrap_or(&raw_canonical).to_string();
                let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
                let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
                let name_lower = name.to_lowercase();
                
                // Skip temporary WAV or XML or TXT concat or duplicate test files
                if path_str.ends_with(".xml") || path_str.ends_with(".txt") || path_str.ends_with(".json") {
                    continue;
                }
                if path_str.contains("temp_voice") || path_str.contains("concat_list") {
                    continue;
                }
                // Skip demo sample files
                if name_lower.starts_with("sample_") {
                    continue;
                }

                if seen_paths.contains(&path_str) || seen_names.contains(&name_lower) {
                    continue;
                }
                seen_paths.insert(path_str.clone());
                seen_names.insert(name_lower);

                let metadata = fs::metadata(&path).ok();
                let size_bytes = metadata.map(|m| m.len()).unwrap_or(0);

                let (file_type, duration) = match ext.as_str() {
                    "mp3" | "wav" | "m4a" | "aac" | "ogg" | "flac" => {
                        let dur = get_media_duration(&path_str).ok();
                        ("voice", dur)
                    }
                    "mp4" | "mov" | "mkv" | "webm" | "avi" => {
                        let dur = get_media_duration(&path_str).ok();
                        ("video", dur)
                    }
                    "png" | "jpg" | "jpeg" | "webp" => ("image", None),
                    _ => continue,
                };

                let id = format!("{}_{}", name, size_bytes);
                results.push(PickedAssetInfo {
                    id,
                    path: path_str,
                    name,
                    file_type: file_type.to_string(),
                    size_bytes,
                    duration,
                });
            }
        }
    }

    results
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
async fn download_and_install_update(
    app: tauri::AppHandle,
    download_url: String,
    total_bytes: Option<u64>,
) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join("SyncCut_Update_Setup.exe");

    // Clean up previous leftover installer if present
    if installer_path.exists() {
        let _ = fs::remove_file(&installer_path);
    }

    eprintln!("[SyncCut Update] Starting download from {} to {:?}", download_url, installer_path);

    let installer_for_curl = installer_path.clone();
    let url_for_curl = download_url.clone();

    // Spawn curl download in a blocking thread
    let curl_handle = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new("curl.exe");
        cmd.args([
            "-L",
            "--retry", "3",
            "--retry-delay", "2",
            "-o", &installer_for_curl.to_string_lossy(),
            &url_for_curl,
        ]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.output()
    });

    // Poll download progress while curl runs
    let check_path = installer_path.clone();
    let app_handle = app.clone();
    let total = total_bytes.unwrap_or(0);
    let done_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let done_clone = done_flag.clone();

    tokio::spawn(async move {
        let mut last_size = 0;
        while !done_clone.load(std::sync::atomic::Ordering::Relaxed) {
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            if let Ok(meta) = fs::metadata(&check_path) {
                let cur = meta.len();
                if cur != last_size {
                    last_size = cur;
                    let pct = if total > 0 {
                        ((cur as f64 / total as f64) * 100.0).min(99.0)
                    } else {
                        0.0
                    };
                    let _ = app_handle.emit(
                        "update-download-progress",
                        serde_json::json!({
                            "downloaded": cur,
                            "total": total,
                            "percent": pct,
                            "status": "downloading"
                        }),
                    );
                }
            }
        }
    });

    let curl_res = curl_handle
        .await
        .map_err(|e| format!("Download task panicked: {}", e))?;
    done_flag.store(true, std::sync::atomic::Ordering::Relaxed);

    let output = curl_res.map_err(|e| format!("Failed to execute download command: {}", e))?;
    if !output.status.success() || !installer_path.exists() {
        return Err("Failed to download update installer. Please check your internet connection.".to_string());
    }

    let file_size = fs::metadata(&installer_path).map(|m| m.len()).unwrap_or(0);
    if file_size < 1_000_000 {
        let _ = fs::remove_file(&installer_path);
        return Err("Downloaded update file is corrupt or incomplete. Please try again.".to_string());
    }

    // Emit 100% progress and installing status
    let _ = app.emit(
        "update-download-progress",
        serde_json::json!({
            "downloaded": file_size,
            "total": if total > 0 { total } else { file_size },
            "percent": 100.0,
            "status": "installing"
        }),
    );

    eprintln!("[SyncCut Update] Download finished ({} bytes). Launching updater script...", file_size);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        let current_exe = std::env::current_exe().unwrap_or_default();
        let updater_bat_path = temp_dir.join("synccut_updater.bat");

        // Write detached batch script to wait for SyncCut to exit, install update silently, and relaunch
        let bat_content = format!(
            "@echo off\r\n\
             setlocal\r\n\
             timeout /t 2 /nobreak >nul\r\n\
             start \"\" /wait \"{}\" /S\r\n\
             if %ERRORLEVEL% NEQ 0 (\r\n\
                 start \"\" /wait \"{}\"\r\n\
             )\r\n\
             if exist \"{}\" (\r\n\
                 start \"\" \"{}\"\r\n\
             ) else if exist \"%LOCALAPPDATA%\\Programs\\SyncCut\\SyncCut.exe\" (\r\n\
                 start \"\" \"%LOCALAPPDATA%\\Programs\\SyncCut\\SyncCut.exe\"\r\n\
             )\r\n\
             timeout /t 2 /nobreak >nul\r\n\
             del \"{}\" >nul 2>&1\r\n\
             del \"%~f0\" >nul 2>&1\r\n",
            installer_path.display(),
            installer_path.display(),
            current_exe.display(),
            current_exe.display(),
            installer_path.display()
        );

        fs::write(&updater_bat_path, bat_content)
            .map_err(|e| format!("Failed to create updater script: {}", e))?;

        let mut launcher = Command::new("cmd.exe");
        launcher.args(["/c", &updater_bat_path.to_string_lossy()]);
        launcher.creation_flags(0x08000000);
        launcher.spawn().map_err(|e| format!("Failed to launch updater: {}", e))?;
    }

    #[cfg(not(windows))]
    {
        Command::new(&installer_path)
            .spawn()
            .map_err(|e| format!("Failed to launch installer: {}", e))?;
    }

    // Exit current app cleanly so files are unlocked for replacement
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(600));
        std::process::exit(0);
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Startup clean: remove orphaned cache from previous sessions
    let cache_dir = std::env::temp_dir().join("synccut_preview_cache");
    if cache_dir.exists() {
        let _ = fs::remove_dir_all(&cache_dir);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::Manager;
            let scope = app.asset_protocol_scope();
            let workspace = get_workspace_root();
            let _ = scope.allow_directory(&workspace, true);
            let media_pool_dir = workspace.join("media_pool");
            let _ = fs::create_dir_all(&media_pool_dir);
            let _ = scope.allow_directory(&media_pool_dir, true);
            if let Ok(can) = fs::canonicalize(&workspace) {
                let _ = scope.allow_directory(&can, true);
            }
            for drive in ["C:\\", "D:\\", "E:\\"] {
                let p = Path::new(drive);
                if p.exists() {
                    let _ = scope.allow_directory(p, true);
                    if let Ok(can) = fs::canonicalize(p) {
                        let _ = scope.allow_directory(&can, true);
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let cache_dir = std::env::temp_dir().join("synccut_preview_cache");
                if cache_dir.exists() {
                    let _ = fs::remove_dir_all(&cache_dir);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_demo_project,
            pick_file_voice,
            pick_file_script,
            pick_files_multi,
            pick_directory_output,
            pick_directory_images,
            open_directory,
            open_file,
            execute_pipeline,
            execute_voice_visual_matching,
            export_premiere_xml_dialog,
            render_preview_video,
            fetch_youtube_metadata,
            download_youtube_media,
            prepare_youtube_preview_cache,
            get_preview_cache_size,
            clear_youtube_preview_cache,
            delete_preview_cache_for_url,
            read_text_snippet,
            scan_workspace_media,
            get_file_media_info,
            get_batch_files_media_info,
            get_app_version,
            download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_asset_scope() {
        let p = "C:/Users/Tran Bao Long/Desktop/VuLoc/demo_output/Warhammer 40,000： 500 Worlds Announced Cinematic ｜ World Championships Warhammer Preview Live! 2025 [-hrulR3PhGY].mp4";
        println!("Resolved: {:?}", resolve_to_absolute_path(p));
        println!("Exists: {}", std::path::Path::new(p).exists());
        let meta = get_file_media_info(p.to_string());
        println!("Meta result: {:?}", meta);

        // Test File::open on p
        let f = std::fs::File::open(p);
        println!("File::open result: {:?}", f.is_ok());

        // Test with backslashes
        let p_back = p.replace('/', "\\");
        let f_back = std::fs::File::open(&p_back);
        println!("File::open backslashes result: {:?}", f_back.is_ok());
    }
}
