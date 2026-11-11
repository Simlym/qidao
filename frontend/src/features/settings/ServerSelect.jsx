import React from "react";

export default function ServerSelect({ value, options, disabled, onChange }) {
  const id = React.useId();
  const trigger = React.useRef(null);
  const optionRefs = React.useRef([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const expanded = open && !disabled;

  React.useEffect(() => {
    if (expanded) optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [expanded, active]);

  function choose(index) {
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  }

  function handleKeyDown(event) {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const start = expanded ? active : selected;
      setActive(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
        : Math.max(0, Math.min(options.length - 1, start + (event.key === "ArrowDown" ? 1 : -1))));
      setOpen(true);
    } else if (expanded && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="server-address-input">
      <span id={`${id}-label`}>服务器</span>
      <div className="server-select" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
        <button ref={trigger} type="button" role="combobox" className="server-select-trigger"
          disabled={disabled} aria-expanded={expanded} aria-controls={`${id}-list`}
          aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox"
          aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
          aria-describedby="server-address-help" onKeyDown={handleKeyDown}
          onClick={() => { setActive(selected); setOpen(!expanded); }}>
          <span id={`${id}-value`} className="server-select-value">{options[selected].label}</span>
          {options[selected].badge && <span className="server-select-badge">{options[selected].badge}</span>}
          <svg className="server-select-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
        </button>
        {expanded && <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="server-select-menu">
          {options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`}
            ref={(element) => { optionRefs.current[index] = element; }} role="option"
            aria-selected={value === option.value} className={`server-select-option${active === index ? " is-active" : ""}`}
            onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}>
            <span className="server-select-value">{option.label}</span>
            {option.badge && <span className="server-select-badge">{option.badge}</span>}
            <svg className="server-select-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>
          </div>)}
        </div>}
      </div>
    </div>
  );
}
