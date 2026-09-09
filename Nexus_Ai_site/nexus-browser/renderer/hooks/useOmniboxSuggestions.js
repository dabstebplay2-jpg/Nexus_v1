import { useState, useEffect, useRef, useCallback } from 'react';

export function useOmniboxSuggestions(input, { enabled = true } = {}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const timerRef = useRef(null);

  const refresh = useCallback(async (q) => {
    if (!enabled || !window.nexusBrowser?.storage?.suggest) {
      setSuggestions([]);
      return;
    }
    try {
      const list = await window.nexusBrowser.storage.suggest(q);
      setSuggestions(Array.isArray(list) ? list : []);
      setSelectedIndex(-1);
    } catch {
      setSuggestions([]);
    }
  }, [enabled]);

  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => refresh(input), input ? 80 : 0);
    return () => clearTimeout(timerRef.current);
  }, [input, open, refresh]);

  const handleFocus = () => {
    setOpen(true);
    refresh(input);
  };

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 160);
  };

  const handleKeyDown = (e, onSelectSuggestion) => {
    if (!open || suggestions.length === 0) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setSelectedIndex(-1);
      return true;
    }
    if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      onSelectSuggestion(suggestions[selectedIndex]);
      setOpen(false);
      return true;
    }
    return false;
  };

  return {
    suggestions,
    open,
    setOpen,
    selectedIndex,
    setSelectedIndex,
    handleFocus,
    handleBlur,
    handleKeyDown,
    refresh,
  };
}
