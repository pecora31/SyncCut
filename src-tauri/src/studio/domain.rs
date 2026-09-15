use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub profile: String,
    pub resource: String,
    pub fps_num: i64,
    pub fps_den: i64,
    pub width: i64,
    pub height: i64,
    pub shot_seconds: f64,
    pub top_k: usize,
    pub rerank_k: usize,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            profile: "quality".into(),
            resource: "focused".into(),
            fps_num: 30,
            fps_den: 1,
            width: 1920,
            height: 1080,
            shot_seconds: 4.5,
            top_k: 20,
            rerank_k: 5,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size_bytes: u64,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub fingerprint: Option<String>,
    #[serde(default)]
    pub width: i64,
    #[serde(default)]
    pub height: i64,
    #[serde(default)]
    pub fps_num: i64,
    #[serde(default = "one")]
    pub fps_den: i64,
    #[serde(default)]
    pub has_audio: bool,
    #[serde(default)]
    pub has_video: bool,
    #[serde(default)]
    pub channels: i64,
    #[serde(default)]
    pub sample_rate: i64,
    #[serde(default)]
    pub codec: String,
}
fn one() -> i64 {
    1
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub aligned: bool,
    #[serde(default)]
    pub asr_score: Option<f64>,
    #[serde(default)]
    pub alignment_score: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Beat {
    pub id: String,
    pub script: String,
    pub spoken: String,
    pub text: String,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub status: String,
    pub issue: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Keyframe {
    pub path: String,
    pub time: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shot {
    pub id: String,
    pub asset_id: String,
    pub source_in: f64,
    pub source_out: f64,
    pub keyframes: Vec<Keyframe>,
    pub caption: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub shot_id: String,
    pub similarity: f64,
    pub verdict: String,
    pub reason: String,
    pub evidence_times: Vec<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Match {
    pub beat_id: String,
    pub visual_brief: String,
    pub candidates: Vec<Candidate>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub beat_id: Option<String>,
    pub asset_id: Option<String>,
    pub shot_id: Option<String>,
    pub start: i64,
    pub end: i64,
    pub source_in: f64,
    pub source_out: f64,
    pub state: String,
    pub locked: bool,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub schema_version: i64,
    pub id: String,
    pub root: String,
    pub name: String,
    pub revision: i64,
    pub assets: Vec<Asset>,
    pub voice_id: Option<String>,
    pub script_id: Option<String>,
    pub visual_ids: Vec<String>,
    pub settings: Settings,
    pub duration: f64,
    pub words: Vec<Word>,
    pub beats: Vec<Beat>,
    pub shots: Vec<Shot>,
    pub matches: Vec<Match>,
    pub clips: Vec<Clip>,
    #[serde(default)]
    pub provenance: serde_json::Value,
    #[serde(default)]
    pub export_path: Option<String>,
}

pub fn sequence_frames(project: &Project) -> i64 {
    let fps = project.settings.fps_num as f64 / project.settings.fps_den as f64;
    // Ignore floating point roundoff at an exact frame boundary, not real audio time.
    (project.duration * fps - 1e-7).ceil().max(0.0) as i64
}

pub fn validate(project: &Project, strict: bool) -> Result<(), String> {
    let settings = &project.settings;
    if project.schema_version != 2 {
        return Err("Unsupported project version.".into());
    }
    if !["quality", "fast"].contains(&settings.profile.as_str())
        || !["focused", "shared"].contains(&settings.resource.as_str())
    {
        return Err("Invalid processing profile.".into());
    }
    if settings.resource == "shared" && settings.profile != "fast" {
        return Err("Shared resources requires the Fast model profile.".into());
    }
    if ![
        (24, 1),
        (25, 1),
        (30, 1),
        (30000, 1001),
        (24000, 1001),
        (60, 1),
        (60000, 1001),
    ]
    .contains(&(settings.fps_num, settings.fps_den))
    {
        return Err("Unsupported sequence frame rate.".into());
    }
    if ![(1920, 1080), (1080, 1920), (3840, 2160)].contains(&(settings.width, settings.height))
        || !(1.0..=12.0).contains(&settings.shot_seconds)
        || settings.top_k < 1
        || settings.top_k > 100
        || settings.rerank_k < 1
        || settings.rerank_k > settings.top_k
    {
        return Err("Invalid sequence or retrieval settings.".into());
    }
    if !project.duration.is_finite() || project.duration < 0.0 {
        return Err("Invalid voice duration.".into());
    }
    let mut ids = HashSet::new();
    let mut paths = HashSet::new();
    for a in &project.assets {
        if !ids.insert(&a.id) || !paths.insert(a.path.replace('\\', "/").to_lowercase()) {
            return Err("Duplicate asset ID or path.".into());
        }
        if !["voice", "video", "image", "script"].contains(&a.kind.as_str())
            || !std::path::Path::new(&a.path).is_absolute()
        {
            return Err("Assets must have a supported type and absolute path.".into());
        }
    }
    for id in project
        .voice_id
        .iter()
        .chain(project.script_id.iter())
        .chain(project.visual_ids.iter())
    {
        if !ids.contains(id) {
            return Err("A selected source no longer exists in this project.".into());
        }
    }
    if let Some(id) = &project.voice_id {
        let a = project.assets.iter().find(|a| &a.id == id).unwrap();
        if !["voice", "video"].contains(&a.kind.as_str()) {
            return Err("Select an audio or video voiceover.".into());
        }
    }
    if let Some(id) = &project.script_id {
        if project.assets.iter().find(|a| &a.id == id).unwrap().kind != "script" {
            return Err("Select a text script.".into());
        }
    }
    for id in &project.visual_ids {
        if !["video", "image"].contains(
            &project
                .assets
                .iter()
                .find(|a| &a.id == id)
                .unwrap()
                .kind
                .as_str(),
        ) {
            return Err("Footage must be video or images.".into());
        }
    }
    let mut intervals = vec![];
    let mut beat_ids = HashSet::new();
    for beat in &project.beats {
        if !beat_ids.insert(&beat.id) {
            return Err("Duplicate speech passage ID.".into());
        }
        if !["verified", "review", "accepted", "excluded"].contains(&beat.status.as_str()) {
            return Err("Invalid speech review status.".into());
        }
        if beat.status == "excluded" {
            continue;
        }
        match (beat.start, beat.end) {
            (Some(a), Some(b))
                if a.is_finite()
                    && b.is_finite()
                    && a >= 0.0
                    && b > a
                    && b <= project.duration + 0.001 =>
            {
                if beat.status != "review" {
                    intervals.push((a, b));
                }
            }
            _ if beat.status == "review" && !strict => (),
            _ => return Err("A speech passage has invalid or missing boundaries.".into()),
        }
        if strict && beat.status == "review" {
            return Err("Review speech mismatches first.".into());
        }
    }
    intervals.sort_by(|a, b| a.0.total_cmp(&b.0));
    if intervals.windows(2).any(|w| w[0].1 > w[1].0 + 0.001) {
        return Err(
            "Accepted speech passages overlap. Adjust their boundaries or exclude a duplicate."
                .into(),
        );
    }
    let assets: HashMap<_, _> = project.assets.iter().map(|a| (&a.id, a)).collect();
    let shots: HashMap<_, _> = project.shots.iter().map(|s| (&s.id, s)).collect();
    if shots.len() != project.shots.len() {
        return Err("Duplicate scene ID.".into());
    }
    for word in &project.words {
        if !word.start.is_finite()
            || !word.end.is_finite()
            || word.start < 0.0
            || word.end < word.start
            || word.end > project.duration + 0.1
        {
            return Err("Invalid observed word boundary.".into());
        }
    }
    for shot in &project.shots {
        let a = assets
            .get(&shot.asset_id)
            .ok_or("Scene refers to missing media.")?;
        if !shot.source_in.is_finite() || !shot.source_out.is_finite() || shot.source_in < 0.0 {
            return Err("Invalid scene boundary.".into());
        }
        if a.kind != "image"
            && (shot.source_out <= shot.source_in
                || shot.source_out > a.duration.unwrap_or(0.0) + 0.001)
        {
            return Err("Scene exceeds its source media.".into());
        }
        if !["video", "image"].contains(&a.kind.as_str()) || shot.keyframes.is_empty() {
            return Err("Scene has no visual evidence.".into());
        }
        for frame in &shot.keyframes {
            if !frame.time.is_finite()
                || frame.time < shot.source_in - 0.001
                || frame.time > shot.source_out + 0.001
                || !std::path::Path::new(&frame.path).is_absolute()
            {
                return Err("Invalid scene evidence frame.".into());
            }
        }
    }
    for row in &project.matches {
        if !project.beats.iter().any(|b| b.id == row.beat_id) {
            return Err("Candidate row refers to a missing passage.".into());
        }
        for c in &row.candidates {
            if !shots.contains_key(&c.shot_id)
                || !c.similarity.is_finite()
                || !["match", "partial", "unrelated", "unreviewed"].contains(&c.verdict.as_str())
            {
                return Err("Invalid scene candidate.".into());
            }
            let shot = shots[&c.shot_id];
            if (c.verdict == "match" && c.evidence_times.is_empty())
                || c.evidence_times.iter().any(|t| {
                    !t.is_finite() || !shot.keyframes.iter().any(|f| (f.time - t).abs() < 0.08)
                })
            {
                return Err("Candidate does not cite its observed evidence.".into());
            }
        }
    }
    let fps = settings.fps_num as f64 / settings.fps_den as f64;
    let end_frame = sequence_frames(project);
    let mut clips: Vec<_> = project.clips.iter().collect();
    clips.sort_by_key(|c| c.start);
    let mut cursor = 0;
    let mut clip_ids = HashSet::new();
    for clip in clips {
        if !["suggested", "accepted", "gap"].contains(&clip.state.as_str())
            || clip
                .beat_id
                .as_ref()
                .is_some_and(|id| !beat_ids.contains(id))
        {
            return Err("Invalid clip state or speech passage.".into());
        }
        if !clip_ids.insert(&clip.id)
            || clip.start != cursor
            || clip.end <= clip.start
            || clip.end > end_frame
        {
            return Err("Timeline must contain unique, ordered clips covering the voice without overlaps or implicit gaps.".into());
        }
        cursor = clip.end;
        if let Some(id) = &clip.asset_id {
            if clip.state == "gap" {
                return Err("A gap cannot contain media.".into());
            }
            let a = assets.get(id).ok_or("Clip refers to missing media.")?;
            let shot = clip
                .shot_id
                .as_ref()
                .and_then(|s| shots.get(s))
                .ok_or("Clip has no source scene.")?;
            if &shot.asset_id != id {
                return Err("Clip source does not match its scene.".into());
            }
            if !clip.source_in.is_finite() || !clip.source_out.is_finite() || clip.source_in < 0.0 {
                return Err("Invalid clip source range.".into());
            }
            if a.kind == "video" {
                let duration = (clip.end - clip.start) as f64 / fps;
                if clip.source_in + duration > a.duration.unwrap_or(0.0) + 1e-6
                    || clip.source_in < shot.source_in - 1e-6
                    || clip.source_out > shot.source_out + 1e-6
                    || (clip.source_out - clip.source_in - duration).abs() > 1e-5
                {
                    return Err(format!(
                        "Clip exceeds its verified scene or source: {}",
                        a.name
                    ));
                }
            } else if a.kind != "image" {
                return Err("Audio cannot be used as a visual clip.".into());
            }
        } else if clip.state != "gap" {
            return Err("Missing media must be an explicit gap.".into());
        }
    }
    if !project.clips.is_empty() && cursor != end_frame {
        return Err("Timeline does not cover the complete voiceover.".into());
    }
    Ok(())
}

pub fn plan(project: &mut Project) -> Result<(), String> {
    validate(project, true)?;
    let fps = project.settings.fps_num as f64 / project.settings.fps_den as f64;
    let total = sequence_frames(project);
    let target = (project.settings.shot_seconds * fps).round().max(1.0) as i64;
    let locked: Vec<_> = project.clips.iter().filter(|c| c.locked).cloned().collect();
    let assets: HashMap<_, _> = project.assets.iter().map(|a| (a.id.clone(), a)).collect();
    let shots: HashMap<_, _> = project.shots.iter().map(|s| (s.id.clone(), s)).collect();
    let mut clips = vec![];
    let mut cursor = 0;
    let mut consumed: HashMap<String, f64> = HashMap::new();
    for c in &locked {
        if let Some(id) = &c.shot_id {
            consumed
                .entry(id.clone())
                .and_modify(|end| *end = end.max(c.source_out))
                .or_insert(c.source_out);
        }
    }
    let mut recent = vec![];
    while cursor < total {
        if let Some(c) = locked.iter().find(|c| c.start == cursor) {
            clips.push(c.clone());
            cursor = c.end;
            continue;
        }
        let limit = locked
            .iter()
            .filter(|c| c.start > cursor)
            .map(|c| c.start)
            .min()
            .unwrap_or(total);
        let beat = project.beats.iter().find(|b| {
            b.status != "excluded"
                && b.start
                    .is_some_and(|start| (start * fps).round() as i64 <= cursor)
                && b.end.is_some_and(|end| (end * fps).round() as i64 > cursor)
        });
        let boundary = beat
            .map(|b| (b.end.unwrap() * fps).round() as i64)
            .unwrap_or_else(|| {
                project
                    .beats
                    .iter()
                    .filter(|b| {
                        b.status != "excluded"
                            && b.start
                                .is_some_and(|start| (start * fps).round() as i64 > cursor)
                    })
                    .map(|b| (b.start.unwrap() * fps).round() as i64)
                    .min()
                    .unwrap_or(total)
            })
            .min(limit)
            .min(total)
            .max(cursor + 1);
        let desired = (boundary - cursor).min(target);
        let row = beat.and_then(|b| project.matches.iter().find(|r| r.beat_id == b.id));
        let mut options = vec![];
        if let Some(row) = row {
            for candidate in row.candidates.iter().filter(|c| c.verdict == "match") {
                let shot = shots.get(&candidate.shot_id).ok_or("Missing scene.")?;
                let asset = assets.get(&shot.asset_id).ok_or("Missing source.")?;
                let source = consumed.get(&shot.id).copied().unwrap_or(shot.source_in);
                let available = if asset.kind == "image" {
                    desired
                } else {
                    ((shot.source_out - source) * fps).floor() as i64
                };
                let count = available.min(desired);
                if count < ((0.5 * fps) as i64).min(desired) {
                    continue;
                }
                let repetition = recent
                    .iter()
                    .rev()
                    .take(3)
                    .filter(|id| *id == &shot.asset_id)
                    .count() as f64;
                let score =
                    candidate.similarity - repetition * 0.15 + count as f64 / desired as f64 * 0.12;
                options.push((score, candidate, *shot, source, count));
            }
        }
        options.sort_by(|a, b| b.0.total_cmp(&a.0));
        if let Some((_, candidate, shot, source, count)) = options.first() {
            let duration = *count as f64 / fps;
            let image = assets[&shot.asset_id].kind == "image";
            clips.push(Clip {
                id: uuid::Uuid::new_v4().to_string(),
                beat_id: beat.map(|b| b.id.clone()),
                asset_id: Some(shot.asset_id.clone()),
                shot_id: Some(shot.id.clone()),
                start: cursor,
                end: cursor + count,
                source_in: if image { 0.0 } else { *source },
                source_out: if image { 0.0 } else { source + duration },
                state: "suggested".into(),
                locked: false,
                reason: candidate.reason.clone(),
            });
            if !image {
                consumed.insert(shot.id.clone(), source + duration);
            }
            recent.push(shot.asset_id.clone());
            cursor += count;
        } else {
            clips.push(Clip { id: uuid::Uuid::new_v4().to_string(), beat_id: beat.map(|b| b.id.clone()), asset_id: None, shot_id: None,
                start: cursor, end: boundary, source_in: 0.0, source_out: 0.0, state: "gap".into(), locked: false,
                reason: if beat.is_some() { "No verified source with enough unused duration. Choose an alternative or keep a gap.".into() } else { "Pause in the recording. Add a scene or keep an intentional gap.".into() } });
            cursor = boundary;
        }
    }
    project.clips = clips;
    project.export_path = None;
    validate(project, true)
}
