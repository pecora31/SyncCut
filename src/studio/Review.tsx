import { useState } from "react";
import { safeConvertFileSrc } from "../utils/mediaUtils";
import { Asset, Beat, Candidate, clock, Project } from "./types";

export function BeatEditor({
  beat,
  disabled,
  onSave,
}: {
  beat: Beat;
  disabled: boolean;
  onSave: (beat: Beat) => void;
}) {
  const [draft, setDraft] = useState(beat);
  return (
    <div className="sc-editor">
      <span className="sc-eyebrow">PASSAGE REVIEW</span>
      <label>
        Script
        <textarea
          value={draft.text}
          disabled={disabled}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        />
      </label>
      <p className="sc-muted">
        Recorded: {beat.spoken || "No matching speech found."}
      </p>
      {beat.issue && <p>{beat.issue}</p>}
      <div className="sc-row">
        <label>
          Start · seconds
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.start ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                start: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          End · seconds
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.end ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                end: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
      </div>
      <div className="sc-row">
        <button
          disabled={
            disabled ||
            draft.start === null ||
            draft.end === null ||
            draft.end <= draft.start ||
            !draft.text.trim()
          }
          onClick={() => onSave({ ...draft, status: "accepted", issue: "" })}
        >
          Use reviewed passage
        </button>
        <button
          disabled={disabled}
          onClick={() => onSave({ ...draft, status: "excluded" })}
        >
          Exclude
        </button>
      </div>
    </div>
  );
}

export function Candidates({
  project,
  candidates,
  onPreview,
  onChoose,
  disabled,
}: {
  project: Project;
  candidates: Candidate[];
  onPreview: (a: Asset, start?: number) => void;
  onChoose?: (id: string) => void;
  disabled: boolean;
}) {
  const [selectedId, setSelectedId] = useState("");
  if (!candidates.length)
    return (
      <p className="sc-empty">
        No suggestions for this passage. Select another passage or run scene
        matching.
      </p>
    );
  return (
    <div className="sc-candidates">
      {candidates.map((c) => {
        const shot = project.shots.find((s) => s.id === c.shotId);
        const asset = project.assets.find((a) => a.id === shot?.assetId);
        if (!shot || !asset) return null;
        return (
          <article
            key={c.shotId}
            className={`sc-candidate ${selectedId === c.shotId ? "selected" : ""}`}
            onClick={() => setSelectedId(c.shotId)}
          >
            <div className="sc-row sc-between">
              <strong>{asset.name}</strong>
              <span className="sc-tag">{c.verdict}</span>
            </div>
            <div className="sc-keyframes">
              {shot.keyframes.map((f) => (
                <button
                  key={f.path}
                  title="Double-click to preview source"
                  onDoubleClick={() => onPreview(asset, f.time)}
                >
                  <img
                    loading="lazy"
                    decoding="async"
                    src={safeConvertFileSrc(f.path)}
                    alt={shot.caption || asset.name}
                  />
                  <span>{clock(f.time)}</span>
                </button>
              ))}
            </div>
            <p>{c.reason || "Awaiting visual verification."}</p>
            {shot.caption && <p className="sc-muted">{shot.caption}</p>}
            <div className="sc-row sc-between">
              <span className="sc-muted">
                {clock(shot.sourceIn)} – {clock(shot.sourceOut)}
              </span>
              {onChoose && (
                <button disabled={disabled} onClick={() => onChoose(shot.id)}>
                  Use this scene
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
