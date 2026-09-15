use super::domain::{sequence_frames, validate, Project};
use serde_json::Value;
use std::{fmt::Write as _, fs, path::Path};

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn uri(path: &str) -> Result<String, String> {
    url::Url::from_file_path(Path::new(path))
        .map(|url| escape(url.as_str()))
        .map_err(|_| "Export path must be absolute.".into())
}

pub fn write(project: &Project, media: &Value) -> Result<String, String> {
    validate(project, true)?;
    let s = &project.settings;
    let timebase = if s.fps_den == 1001 {
        s.fps_num / 1000
    } else {
        s.fps_num
    };
    let ntsc = if s.fps_den == 1001 { "TRUE" } else { "FALSE" };
    let rate = format!(
        "<rate><timebase>{}</timebase><ntsc>{}</ntsc></rate>",
        timebase, ntsc
    );
    let frames = sequence_frames(project);
    let folder = media["folder"].as_str().ok_or("Missing export folder.")?;
    let voice = media["voicePath"]
        .as_str()
        .ok_or("Missing conformed voiceover.")?;
    if !Path::new(voice).is_file() {
        return Err("Conformed voiceover is missing.".into());
    }
    let items = media["items"].as_array().ok_or("Missing export media.")?;
    if media["sequenceFrames"].as_i64() != Some(frames) {
        return Err("Export duration differs from the timeline.".into());
    }
    let mut xml=format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE xmeml>\n<xmeml version=\"4\"><sequence id=\"synccut-sequence\"><name>{}</name><duration>{}</duration>{}<media><video><format><samplecharacteristics><width>{}</width><height>{}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance>{}</samplecharacteristics></format><track>",escape(&project.name),frames,rate,s.width,s.height,rate);
    let mut seen = std::collections::HashSet::new();
    for (index, item) in items.iter().enumerate() {
        let id = item["clipId"].as_str().ok_or("Missing export clip ID.")?;
        if !seen.insert(id) {
            return Err("Duplicate export clip.".into());
        }
        let clip = project
            .clips
            .iter()
            .find(|c| c.id == id && c.asset_id.is_some())
            .ok_or("Export clip does not exist in the timeline.")?;
        let count = clip.end - clip.start;
        if item["frames"].as_i64() != Some(count)
            || item["start"].as_i64() != Some(clip.start)
            || item["end"].as_i64() != Some(clip.end)
        {
            return Err("Export clip frame count differs from timeline.".into());
        }
        let path = item["path"].as_str().ok_or("Missing export clip file.")?;
        if !Path::new(path).is_file() {
            return Err("Conformed export clip is missing.".into());
        }
        let name = escape(item["name"].as_str().unwrap_or("Scene"));
        write!(&mut xml,"<clipitem id=\"video-{index}\"><name>{name}</name><duration>{count}</duration>{rate}<start>{}</start><end>{}</end><in>0</in><out>{count}</out><file id=\"media-{index}\"><name>{name}</name><pathurl>{}</pathurl>{rate}<duration>{count}</duration><media><video><samplecharacteristics><width>{}</width><height>{}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance>{rate}</samplecharacteristics></video></media></file></clipitem>",clip.start,clip.end,uri(path)?,s.width,s.height).map_err(|e|e.to_string())?;
    }
    if seen.len()
        != project
            .clips
            .iter()
            .filter(|c| c.asset_id.is_some())
            .count()
    {
        return Err("Some timeline clips were not rendered.".into());
    }
    xml.push_str("</track></video><audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>24</depth><samplerate>48000</samplerate></samplecharacteristics></format>");
    for channel in 1..=2 {
        let file = if channel == 1 {
            format!("<file id=\"voice-file\"><name>Voiceover</name><pathurl>{}</pathurl>{rate}<duration>{frames}</duration><media><audio><samplecharacteristics><depth>24</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio></media></file>",uri(voice)?)
        } else {
            "<file id=\"voice-file\"/>".into()
        };
        write!(&mut xml,"<track><clipitem id=\"voice-{channel}\"><name>Voiceover</name><duration>{frames}</duration>{rate}<start>0</start><end>{frames}</end><in>0</in><out>{frames}</out>{file}<sourcetrack><mediatype>audio</mediatype><trackindex>{channel}</trackindex></sourcetrack></clipitem></track>").map_err(|e|e.to_string())?;
    }
    xml.push_str("</audio></media>");
    for beat in project.beats.iter().filter(|b| b.status != "excluded") {
        if let (Some(start), Some(end)) = (beat.start, beat.end) {
            write!(&mut xml,"<marker><name>Passage</name><comment>{}</comment><in>{}</in><out>{}</out></marker>",escape(&beat.text),(start*s.fps_num as f64/s.fps_den as f64).round() as i64,(end*s.fps_num as f64/s.fps_den as f64).round() as i64).map_err(|e|e.to_string())?;
        }
    }
    xml.push_str("</sequence></xmeml>");
    let output = Path::new(folder).join("SyncCut.xml");
    fs::write(&output, xml).map_err(|e| e.to_string())?;
    Ok(output.to_string_lossy().into_owned())
}
