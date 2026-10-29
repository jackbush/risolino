import { useEffect, useRef, useState } from 'react';
import { INK_GROUPS } from '../config/inks';
import { InkColor } from '../types';

interface ColorPickerProps {
  onSelect: (ink: InkColor) => void;
  onClose: () => void;
  currentColor?: InkColor;
  paperColor?: string;
  onPreview?: (ink: InkColor | null) => void;
}

export function ColorPicker({ onSelect, onClose, currentColor, paperColor, onPreview }: ColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoveredInk, setHoveredInk] = useState<InkColor | null>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Escape backs out without choosing: drop the hover preview, then close.
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onPreview?.(null);
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    // Start keyboard users on the current ink.
    ref.current?.querySelector<HTMLButtonElement>('.color-picker-swatch--active')?.focus();
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, onPreview]);

  const displayName = hoveredInk?.name ?? currentColor?.name ?? '';

  return (
    <div
      className="color-picker"
      ref={ref}
      role="dialog"
      aria-label="Choose an ink"
      style={paperColor ? { backgroundColor: paperColor } : undefined}
      onMouseLeave={() => { setHoveredInk(null); onPreview?.(null); }}
    >
      <div className="color-picker-label">{displayName}</div>
      {INK_GROUPS.map((group) => (
        <div key={group.label} className="color-picker-group">
          <div className="color-picker-group-label">{group.label}</div>
          <div className="color-picker-group-swatches">
            {group.inks.map((ink) => {
              const isActive = currentColor?.hex.toUpperCase() === ink.hex.toUpperCase();
              return (
                <button
                  type="button"
                  key={ink.name}
                  className={`color-picker-swatch${isActive ? ' color-picker-swatch--active' : ''}`}
                  style={{ backgroundColor: ink.hex }}
                  aria-label={ink.name}
                  aria-pressed={isActive}
                  onMouseEnter={() => { setHoveredInk(ink); onPreview?.(ink); }}
                  onFocus={() => { setHoveredInk(ink); onPreview?.(ink); }}
                  onClick={() => {
                    onSelect(ink);
                    onClose();
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
