import { useEffect, useRef } from 'react';

export default function OmniboxOverflowMenu({
  open,
  onClose,
  items,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="omnibox-overflow-menu" ref={ref}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="omnibox-overflow-item"
          onClick={() => {
            item.onClick?.();
            onClose?.();
          }}
          disabled={item.disabled}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
