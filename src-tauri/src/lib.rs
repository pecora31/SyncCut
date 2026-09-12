use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub voice_path: String,
    pub script_path: String,
    pub output_dir: String,
    pub youtube_urls: Vec<String>,
    pub images_dir: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
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
pub struct InterleavingSettings {
    pub video_ratio: i32, // 0 to 100
    pub pattern: String,  // "alternate", "ratio", "random"
    pub min_scene_duration: f64,
    pub max_scene_duration: f64,
    pub fps: f64,
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

    // 2. Read Script Content
    let script_content = fs::read_to_string(&config.script_path)
        .map_err(|e| format!("Cannot read script file: {}", e))?;

    // Parse sentences by line or punctuation
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

    // 3. Get Voice Total Duration
    let total_duration = get_media_duration(&config.voice_path).unwrap_or(120.0);

    // 4. Download YouTube Videos if present
    let mut downloaded_videos = download_youtube_sources(&config.youtube_urls, &sources_dir);

    // If no youtube videos were downloaded, use the voice video itself as fallback source
    if downloaded_videos.is_empty() {
        downloaded_videos.push(PathBuf::from(&config.voice_path));
    }

    // 5. Build Forced Alignment Segments
    let mut segments = Vec::new();
    let mut current_time = 0.0;

    for (idx, sentence) in raw_sentences.iter().enumerate() {
        let is_last = idx == raw_sentences.len() - 1;
        let seg_duration = if is_last {
            (total_duration - current_time).max(1.0)
        } else {
            // Allocate duration proportional to word count
            let word_count = sentence.split_whitespace().count().max(3);
            let estimated_dur = (word_count as f64 * 0.4).clamp(
                settings.min_scene_duration,
                settings.max_scene_duration,
            );
            estimated_dur.min(total_duration - current_time)
        };

        let start_time = current_time;
        let end_time = (current_time + seg_duration).min(total_duration);
        current_time = end_time;

        // Determine Asset Type (Video vs Image) based on settings
        let target_ratio = settings.video_ratio.clamp(0, 100) as usize;
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
        let source_out = source_in + (end_time - start_time);

        segments.push(SentenceSegment {
            id: idx + 1,
            text: sentence.clone(),
            start_time,
            end_time,
            duration: end_time - start_time,
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

        if current_time >= total_duration {
            break;
        }
    }

    // 6. Generate Premiere XML (XMEML v4)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            pick_file_voice,
            pick_file_script,
            pick_directory_output,
            pick_directory_images,
            open_directory,
            execute_pipeline
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
