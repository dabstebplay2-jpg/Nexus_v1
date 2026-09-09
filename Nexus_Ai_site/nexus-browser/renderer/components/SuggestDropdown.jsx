import { Clock, Star, Search, Globe, LayoutGrid } from 'lucide-react';

const ICONS = {
  history: Clock,
  bookmark: Star,
  shortcut: LayoutGrid,
  search: Search,
  url: Globe,
};

export default function SuggestDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  onHover,
  visible,
  className = '',
}) {
  if (!visible || !suggestions.length) return null;

  return (
    <ul className={`suggest-dropdown ${className}`} role="listbox">
      {suggestions.map((s, i) => {
        const Icon = ICONS[s.type] || Globe;
        return (
          <li
            key={`${s.type}-${s.url || s.query}-${i}`}
            role="option"
            aria-selected={i === selectedIndex}
            className={`suggest-item ${i === selectedIndex ? 'selected' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(s)}
            onMouseEnter={() => onHover?.(i)}
          >
            <Icon size={14} className="suggest-icon" />
            <div className="suggest-text">
              <span className="suggest-title">{s.title}</span>
              {s.subtitle && <span className="suggest-subtitle">{s.subtitle}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
