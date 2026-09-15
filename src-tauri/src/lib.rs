use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{Emitter, Manager};
mod studio;

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

#[tauri::command]
fn pick_file_voice() -> Option<String> {
    let dialog = rfd::FileDialog::new()
        .add_filter(
            "Voice Audio/Video",
            &["mp4", "wav", "m4a", "mp3", "aac", "ogg"],
        )
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
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let snippet: String = content.chars().take(400).collect();
    Ok(snippet)
}

#[tauri::command]
fn pick_files_multi() -> Vec<PickedAssetInfo> {
    let dialog = rfd::FileDialog::new()
        .add_filter(
            "Supported Media & Script Files",
            &[
                "mp4", "mov", "mkv", "webm", "avi", "mp3", "wav", "m4a", "aac", "ogg", "flac",
                "txt", "srt", "md", "png", "jpg", "jpeg", "webp",
            ],
        )
        .set_title("Select Voice, Script, and B-Roll Footage Files");

    let mut results = Vec::new();
    if let Some(paths) = dialog.pick_files() {
        for path in paths {
            let path_str = path.to_string_lossy().into_owned();
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let ext = path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
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
fn pick_directory_output() -> Option<String> {
    let dialog = rfd::FileDialog::new().set_title("Select Output Workspace Directory");
    dialog
        .pick_folder()
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn pick_directory_images() -> Option<String> {
    let dialog = rfd::FileDialog::new().set_title("Select Custom Images Directory");
    dialog
        .pick_folder()
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_directory(path: String) -> Result<(), String> {
    let resolved = resolve_to_absolute_path(&path);
    let target = if resolved.exists() {
        resolved
    } else {
        get_workspace_root()
    };
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
            let user_bin = PathBuf::from(local_app_data)
                .join("SyncCut")
                .join("bin")
                .join(&exe_name);
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

    Err("The bundled yt-dlp executable is missing or cannot run. Reinstall this build.".into())
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
    pub mode: String,              // "full_video", "audio_only", "video_only"
    pub video_height: Option<i64>, // e.g. 2160, 1440, 1080, 720, 480
    pub video_container: String,   // "mp4", "mkv", "webm"
    pub audio_abr: Option<i64>,    // e.g. 320, 160, 128
    pub audio_container: String,   // "wav", "mp3", "m4a", "aac", "flac"
    pub time_range_start: Option<String>,
    pub time_range_end: Option<String>,
}

#[tauri::command]
async fn fetch_youtube_metadata(url: String) -> Result<YouTubeMetadata, String> {
    tokio::task::spawn_blocking(move || {
        let ytdlp_path = ensure_ytdlp()?;
        let mut cmd = Command::new(&ytdlp_path);
        cmd.args(["--dump-json", "--no-playlist", "--no-update", &url]);

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
            let first_lines: Vec<&str> = msg
                .lines()
                .filter(|l| !l.trim().is_empty())
                .take(2)
                .collect();
            return Err(first_lines.join(" "));
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let v: serde_json::Value = serde_json::from_str(&json_str)
            .map_err(|e| format!("Unable to parse video info: {}", e))?;

        let id = v["id"].as_str().unwrap_or("").to_string();
        let title = v["title"].as_str().unwrap_or("YouTube Video").to_string();
        let channel = v["uploader"]
            .as_str()
            .or_else(|| v["channel"].as_str())
            .unwrap_or("")
            .to_string();
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
                let format_url = f["url"]
                    .as_str()
                    .filter(|u| u.starts_with("http"))
                    .map(|u| u.to_string());
                let protocol = f["protocol"].as_str().unwrap_or("");

                // Track HLS m3u8 streams (capped at 1080p for ultra-smooth preview scrubbing)
                if protocol == "m3u8_native"
                    || format_url
                        .as_ref()
                        .map(|u| u.contains(".m3u8"))
                        .unwrap_or(false)
                {
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

                        let size_bytes = f["filesize"]
                            .as_f64()
                            .or_else(|| f["filesize_approx"].as_f64());
                        let approx_size_mb =
                            size_bytes.map(|b| (b / (1024.0 * 1024.0) * 10.0).round() / 10.0);

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
        let preview_stream_url = best_progressive_stream
            .map(|(u, _)| u)
            .or_else(|| {
                v["formats"].as_array().and_then(|arr| {
                    arr.iter()
                        .find(|f| {
                            let vcodec = f["vcodec"].as_str().unwrap_or("none");
                            let acodec = f["acodec"].as_str().unwrap_or("none");
                            let u = f["url"].as_str().unwrap_or("");
                            vcodec != "none" && acodec != "none" && u.starts_with("http")
                        })
                        .and_then(|f| f["url"].as_str().map(|s| s.to_string()))
                })
            })
            .or_else(|| {
                v["url"]
                    .as_str()
                    .filter(|u| u.starts_with("http"))
                    .map(|s| s.to_string())
            });

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

        let runtime=studio::studio_runtime(app.clone(),Some(false))?;
        if runtime["binariesReady"]!=true {return Err("Install and select the FFmpeg runtime before downloading media.".into());}
        args.push("--ffmpeg-location".into());
        args.push(runtime["binDir"].as_str().ok_or("Missing FFmpeg directory.")?.into());
        args.push("--".into());
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
    let name = p
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let size_bytes = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
    let dur = get_media_duration(&abs_clean).ok();
    let ext = p
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
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
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let raw_canonical = path
                    .canonicalize()
                    .unwrap_or_else(|_| path.clone())
                    .to_string_lossy()
                    .into_owned();
                let path_str = raw_canonical
                    .strip_prefix(r"\\?\")
                    .unwrap_or(&raw_canonical)
                    .to_string();
                let ext = path
                    .extension()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                let name_lower = name.to_lowercase();

                // Skip temporary WAV or XML or TXT concat or duplicate test files
                if path_str.ends_with(".xml")
                    || path_str.ends_with(".txt")
                    || path_str.ends_with(".json")
                {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Startup clean: remove orphaned cache from previous sessions
    let cache_dir = std::env::temp_dir().join("synccut_preview_cache");
    if cache_dir.exists() {
        let _ = fs::remove_dir_all(&cache_dir);
    }

    tauri::Builder::default()
        .manage(studio::StudioState::default())
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
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                studio::shutdown(window.app_handle());
                let cache_dir = std::env::temp_dir().join("synccut_preview_cache");
                if cache_dir.exists() {
                    let _ = fs::remove_dir_all(&cache_dir);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            pick_file_voice,
            pick_file_script,
            pick_files_multi,
            pick_directory_output,
            pick_directory_images,
            open_directory,
            open_file,
            studio::studio_bootstrap,
            studio::studio_open_project,
            studio::studio_load_project,
            studio::studio_save_project,
            studio::studio_import,
            studio::studio_runtime,
            studio::studio_runtime_prerequisites,
            studio::studio_pick_runtime_setup_folder,
            studio::studio_runtime_setup_status,
            studio::studio_start_runtime_setup,
            studio::studio_cancel_runtime_setup,
            studio::studio_job,
            studio::studio_start_job,
            studio::studio_control_job,
            studio::studio_replan,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
