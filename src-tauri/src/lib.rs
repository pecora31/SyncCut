use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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

    let voice_p = demo_dir.join("sample_voice.mp4");
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
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    Ok(())
}

fn get_media_duration(file_path: &str) -> Result<f64, String> {
    let output = Command::new("ffprobe")
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
        
        let output = Command::new("yt-dlp")
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

fn generate_premiere_xml(
    segments: &[SentenceSegment],
    voice_path: &str,
    total_duration: f64,
    fps: f64,
    output_xml_path: &Path,
) -> Result<(), String> {
    let timebase = fps.round() as i64;
    let total_frames = (total_duration * fps).round() as i64;
    
    // Normalize path for XML URL
    let voice_url = format!("file://localhost/{}", voice_path.replace('\\', "/"));

    let mut video_clips_xml = String::new();

    for (idx, seg) in segments.iter().enumerate() {
        let start_frame = (seg.start_time * fps).round() as i64;
        let end_frame = (seg.end_time * fps).round() as i64;
        let duration_frames = end_frame - start_frame;
        let in_frame = (seg.source_in * fps).round() as i64;
        let out_frame = (seg.source_out * fps).round() as i64;
        
        let media_url = format!("file://localhost/{}", seg.source_media_path.replace('\\', "/"));
        let clip_id = format!("clipitem-{}", idx + 1);
        let file_id = format!("file-{}", idx + 1);

        let clip_xml = format!(
            r#"
          <clipitem id="{clip_id}">
            <name>{media_name}</name>
            <duration>{duration_frames}</duration>
            <rate>
              <timebase>{timebase}</timebase>
              <ntsc>FALSE</ntsc>
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
                <ntsc>FALSE</ntsc>
              </rate>
              <duration>{duration_frames}</duration>
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
            media_name = seg.source_media_name,
            duration_frames = duration_frames,
            timebase = timebase,
            start_frame = start_frame,
            end_frame = end_frame,
            in_frame = in_frame,
            out_frame = out_frame,
            file_id = file_id,
            media_url = media_url
        );

        video_clips_xml.push_str(&clip_xml);
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
      <ntsc>FALSE</ntsc>
    </rate>
    <timecode>
      <rate>
        <timebase>{timebase}</timebase>
        <ntsc>FALSE</ntsc>
      </rate>
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>1920</width>
            <height>1080</height>
            <rate>
              <timebase>{timebase}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
          </samplecharacteristics>
        </format>
        <track>
          {video_clips_xml}
        </track>
      </video>
      <audio>
        <track>
          <clipitem id="voiceover-audio-1">
            <name>Voiceover_Track</name>
            <duration>{total_frames}</duration>
            <rate>
              <timebase>{timebase}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <start>0</start>
            <end>{total_frames}</end>
            <in>0</in>
            <out>{total_frames}</out>
            <file id="voice-file-1">
              <name>Voiceover_Source</name>
              <pathurl>{voice_url}</pathurl>
              <rate>
                <timebase>{timebase}</timebase>
                <ntsc>FALSE</ntsc>
              </rate>
              <duration>{total_frames}</duration>
            </file>
          </clipitem>
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>"#,
        total_frames = total_frames,
        timebase = timebase,
        video_clips_xml = video_clips_xml,
        voice_url = voice_url
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_demo_project,
            pick_file_voice,
            pick_file_script,
            pick_directory_output,
            pick_directory_images,
            open_directory,
            open_file,
            execute_pipeline,
            render_preview_video
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
