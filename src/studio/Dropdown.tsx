import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Option { value: string; label: string }

export function Dropdown({ label, value, options, disabled, onChange }: {
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 240 });
  const selected = options.find((option) => option.value === value);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close();
  };
  function show() {
    if (disabled || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    const below = window.innerHeight - box.bottom - 12;
    const height = Math.min(240, Math.max(below, box.top - 12));
    const flip = below < 160 && box.top > below;
    setPosition({ left: box.left, top: flip ? Math.max(8, box.top - height - 6) : box.bottom + 6, width: box.width, maxHeight: height });
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    menu.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismiss = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  return <>
    <button ref={trigger} type="button" className="sc-dropdown-trigger" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} title={selected?.label} onClick={() => open ? close() : show()} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); }
    }}>
      <span>{selected?.label || "Choose an option"}</span><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
    {open && createPortal(<div id={id} ref={menu} className="sc-dropdown-menu" role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={options[active] ? `${id}-${active}` : undefined} style={position} onKeyDown={(event) => {
      if (event.key === "ArrowDown") setActive((index) => Math.min(options.length - 1, index + 1));
      else if (event.key === "ArrowUp") setActive((index) => Math.max(0, index - 1));
      else if (event.key === "Home") setActive(0);
      else if (event.key === "End") setActive(options.length - 1);
      else if (event.key === "Enter" || event.key === " ") choose(active);
      else if (event.key === "Escape") close();
      else if (event.key === "Tab") { setOpen(false); trigger.current?.focus(); return; }
      else return;
      event.preventDefault();
    }}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} data-index={index} role="option" aria-selected={option.value === value} className={`sc-dropdown-option ${index === active ? "active" : ""} ${option.value === value ? "selected" : ""}`} title={option.label} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
        <span>{option.label}</span><span aria-hidden="true">{option.value === value ? "✓" : ""}</span>
      </div>)}
    </div>, document.body)}
  </>;
}
