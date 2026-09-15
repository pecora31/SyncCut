use super::domain::*;
use serde_json::json;

fn fixture() -> Project {
    let folder = std::env::temp_dir();
    serde_json::from_value(json!({
        "schemaVersion":2,"id":"contract","root":folder,"name":"Contract & timing","revision":0,
        "settings":{"profile":"fast","resource":"shared","fpsNum":30000,"fpsDen":1001,"width":1920,"height":1080,"shotSeconds":4.5,"topK":20,"rerankK":5},
        "assets":[
            {"id":"voice","path":folder.join("recording.wav"),"name":"recording.wav","kind":"voice","sizeBytes":1,"duration":10.0},
            {"id":"script","path":folder.join("script.txt"),"name":"script.txt","kind":"script","sizeBytes":1},
            {"id":"video","path":folder.join("footage.mp4"),"name":"footage.mp4","kind":"video","sizeBytes":1,"duration":5.0}
        ],"voiceId":"voice","scriptId":"script","visualIds":["video"],"duration":10.0,"words":[],
        "beats":[{"id":"beat","script":"A car turns.","spoken":"A car turns.","text":"A car turns.","start":0.0,"end":10.0,"status":"verified","issue":""}],
        "shots":[{"id":"shot","assetId":"video","sourceIn":0.0,"sourceOut":5.0,"keyframes":[{"path":folder.join("frame.jpg"),"time":2.5}],"caption":"A car turns."}],
        "matches":[{"beatId":"beat","visualBrief":"A car turning","candidates":[{"shotId":"shot","similarity":0.6,"verdict":"match","reason":"Turning is visible","evidenceTimes":[2.5]}]}],
        "clips":[],"provenance":null,"exportPath":null
    })).unwrap()
}

#[test]
fn planning_covers_fractional_fps_voice_without_exceeding_source() {
    let mut p = fixture();
    plan(&mut p).unwrap();
    assert_eq!(p.clips.first().unwrap().start, 0);
    assert_eq!(p.clips.last().unwrap().end, 300);
    assert!(p.clips.iter().any(|c| c.state == "gap"));
    for c in p.clips.iter().filter(|c| c.asset_id.is_some()) {
        assert!(c.source_out <= 5.0);
    }
    assert!(p.clips.windows(2).all(|w| w[0].end == w[1].start));
}

#[test]
fn unrelated_scene_does_not_fill_the_timeline() {
    let mut p = fixture();
    p.matches[0].candidates[0].verdict = "unrelated".into();
    plan(&mut p).unwrap();
    assert!(p.clips.iter().all(|c| c.asset_id.is_none()));
}

#[test]
fn locked_choice_and_source_range_survive_replanning() {
    let mut p = fixture();
    plan(&mut p).unwrap();
    p.clips[0].locked = true;
    let locked = p.clips[0].clone();
    plan(&mut p).unwrap();
    let retained = p.clips.iter().find(|c| c.id == locked.id).unwrap();
    assert_eq!((retained.start, retained.end), (locked.start, locked.end));
    assert_eq!(
        (retained.source_in, retained.source_out),
        (locked.source_in, locked.source_out)
    );
    assert!(p
        .clips
        .iter()
        .filter(|c| c.id != locked.id && c.asset_id.is_some())
        .all(|c| c.source_in >= locked.source_out));
}

#[test]
fn source_overrun_implicit_gap_and_missing_evidence_are_rejected() {
    let mut p = fixture();
    plan(&mut p).unwrap();
    p.clips[0].source_out = 6.0;
    assert!(validate(&p, true).is_err());
    let mut p = fixture();
    plan(&mut p).unwrap();
    p.clips[0].start = 1;
    assert!(validate(&p, true).is_err());
    let mut p = fixture();
    p.matches[0].candidates[0].evidence_times = vec![];
    assert!(plan(&mut p).is_err());
}

#[test]
fn mismatched_recording_blocks_matching_and_export() {
    let mut p = fixture();
    p.beats[0].status = "review".into();
    assert!(validate(&p, false).is_ok());
    assert!(plan(&mut p).is_err());
}

#[test]
fn exact_fractional_frame_boundary_does_not_gain_a_phantom_frame() {
    let mut p = fixture();
    p.duration = 10.01;
    assert_eq!(sequence_frames(&p), 300);
    p.duration = 10.0101;
    assert_eq!(sequence_frames(&p), 301);
}
