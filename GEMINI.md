# Project Rules

- **English Primary Language Rule**: The application UI must strictly use **English** as its primary default language across all text, headers, labels, buttons, dropdown options, placeholders, and status messages. Do not arbitrarily change or mix languages unless explicitly requested by the user.
- **Zero Icons Rule**: Never add any icons (lucide-react, emojis, SVG icons) to any UI component unless the user explicitly requests them. Use clean, clear text labels instead.
- **Neutral Typography Rule**: Do NOT use multi-colored, rainbow, or colorful text (e.g. green, yellow, blue, cyan, orange, purple text). All text must be clean and simple monochrome/neutral shades:
  - Primary text / titles: White / Off-white (`#ffffff`, `#e6e6e6`, `#f0f0f0`)
  - Secondary text / descriptions: Light gray (`#cccccc`, `#a0a0a0`, `#999999`)
  - Muted labels / metadata: Medium gray (`#757575`, `#666666`)
- **Concise Options Rule**: Do not write wordy explanations, parenthetical notes, or descriptive annotations inside UI options, dropdowns, cards, or buttons (e.g. use `.mp4` instead of `.mp4 (H.264 - ...)`, use `.wav` instead of `.wav (Uncompressed audio...)`, use `1080p` instead of `Full HD (1080p) - Recommended`). Keep all option labels simple, clean, and direct unless explicitly requested.
- **No Zoom / Scaling on Hover Rule**: Do NOT add auto-zoom, scale transforms (`scale-110`, `scale-105`, `scale-125`), blurring, or jarring hover animations on playheads, In/Out handles, icons, or UI interactive elements. Keep all sizes and shapes strictly fixed and stable. Indicate hover states solely via mouse cursor changes (e.g. `cursor-pointer`, `cursor-ew-resize`, `cursor-grab`) and subtle background/color changes without zooming or resizing.
- **Simple Architecture & Native Asset Protocol Rule**: Do NOT create custom TCP socket servers, background HTTP daemons, or complex streaming layers for media playback. Always use standard Tauri v2 `convertFileSrc` with `"assetProtocol": { "enable": true, "scope": ["**"] }`.
- **Media Selection vs Preview UX Rule**: Single-click on any item in workspace lists or media pools MUST ONLY select/highlight the item (`selectedIds`). Double-clicking or dragging to a preview monitor is the ONLY action that mounts an asset to preview.
- **Pipeline Slotting & Thumbnail Rule**: When a video or media asset is dragged or selected into an AI pipeline slot (e.g. Slot 3: Footage) or dropped into the preview monitor, Slot 3 must immediately mount the asset and display the loaded media thumbnail (`<video preload="auto" muted playsInline />` or `<img>`) with a filename overlay, treating it as the chosen video for pipeline processing. Always normalize file paths (`/` vs `\`) during asset lookup.

