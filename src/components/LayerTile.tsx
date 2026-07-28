import { useRef, useState, useEffect, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Layer, InkColor } from '../types';
import { ColorPicker } from './ColorPicker';
import { loadImageFile } from '../engine/imageLoader';
import { prefilterForScale } from '../engine/compositor';

const PREVIEW_SIZE = 86;

const clampOffset = (v: number) => Math.min(10000, Math.max(-10000, v));

interface LayerTileProps {
  layer: Layer;
  advancedEnabled: boolean;
  paperColor?: string;
  composeMode: boolean;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onNameChange: (name: string) => void;
  onColorChange: (inkColor: InkColor) => void;
  onOpacityChange: (opacity: number) => void;
  onScaleChange: (scale: number) => void;
  onOffsetChange: (x: number, y: number) => void;
  onImageUpload: (grayscaleData: ImageData) => void;
}

export function LayerTile({
  layer,
  advancedEnabled,
  paperColor,
  composeMode,
  selected,
  onSelect,
  onRemove,
  onNameChange,
  onColorChange,
  onOpacityChange,
  onScaleChange,
  onOffsetChange,
  onImageUpload,
}: LayerTileProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailRef = useRef<HTMLCanvasElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number; openUpward: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(layer.name);
  const originalColorRef = useRef(layer.inkColor);

  useEffect(() => {
    if (showPicker) {
      originalColorRef.current = layer.inkColor;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPicker]);

  const handlePreview = useCallback((ink: InkColor | null) => {
    if (ink) {
      onColorChange(ink);
    } else {
      onColorChange(originalColorRef.current);
    }
  }, [onColorChange]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    const canvas = thumbnailRef.current;
    if (!canvas || !layer.grayscaleData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const g = layer.grayscaleData;
    // Pre-halve before the big downscale, same as the preview compositor —
    // a single drawImage skip-samples and moirés on halftone-ish imagery
    const src = prefilterForScale(g, Math.min(PREVIEW_SIZE / g.width, PREVIEW_SIZE / g.height));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    ctx.drawImage(src, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
  }, [layer.grayscaleData]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  useEffect(() => {
    if (!showPicker) setPickerPos(null);
  }, [showPicker]);

  function commitName() {
    const trimmed = nameDraft.trim();
    if (trimmed) onNameChange(trimmed);
    else setNameDraft(layer.name);
    setEditingName(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    loadImageFile(file).then(
      (result) => { onImageUpload(result.grayscaleData); setIsLoading(false); },
      (err) => { alert(err instanceof Error ? err.message : 'Failed to load image'); setIsLoading(false); },
    );
    e.target.value = '';
  }

  return (
    <div
      className={`layer-tile${selected ? ' layer-tile--selected' : ''}`}
      ref={setNodeRef}
      style={style}
      onClick={composeMode ? onSelect : undefined}
    >
      {/* Drag handle → selection radio while composing */}
      {composeMode ? (
        <span
          className="layer-select-radio"
          role="radio"
          aria-checked={selected}
          tabIndex={0}
          title="Select layer to compose"
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }}
        >
          {selected ? '◉' : '○'}
        </span>
      ) : (
        <span
          className="layer-drag-handle"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          ⠿
        </span>
      )}

      {/* Image preview */}
      <div
        className="layer-tile-preview-wrap"
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        {isLoading ? (
          <div className="layer-tile-loading" title="Processing…" />
        ) : (
          <canvas
            ref={thumbnailRef}
            className="layer-tile-preview"
            width={PREVIEW_SIZE}
            height={PREVIEW_SIZE}
            title={layer.grayscaleData ? 'Click to replace image' : 'Click to upload image'}
          />
        )}
      </div>

      {/* Color preview */}
      <div className="layer-tile-color-wrap">
        <button
          type="button"
          className="layer-tile-color-preview"
          style={{ backgroundColor: layer.inkColor.hex }}
          title={layer.inkColor.name}
          onClick={(e) => {
            if (!showPicker) {
              const openUpward = window.innerHeight - e.clientY < 325;
              setPickerPos({ left: e.clientX, top: e.clientY, openUpward });
            }
            setShowPicker((v) => !v);
          }}
        />
        {showPicker && pickerPos && (
          <div
            style={{
              position: 'fixed',
              left: pickerPos.left,
              ...(pickerPos.openUpward
                ? { bottom: window.innerHeight - pickerPos.top }
                : { top: pickerPos.top }),
              zIndex: 100,
            }}
          >
            <ColorPicker
              onSelect={(ink) => {
                originalColorRef.current = ink;
                onColorChange(ink);
              }}
              onClose={() => setShowPicker(false)}
              currentColor={layer.inkColor}
              paperColor={paperColor}
              onPreview={handlePreview}
            />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Name + controls + delete */}
      <div className="layer-tile-content">
        <div className="layer-tile-name-row">
          {editingName ? (
            <input
              ref={nameInputRef}
              className="layer-tile-name-input"
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') { setNameDraft(layer.name); setEditingName(false); }
              }}
            />
          ) : (
            <span
              className="layer-tile-name"
              role="button"
              tabIndex={0}
              onClick={() => { setNameDraft(layer.name); setEditingName(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setNameDraft(layer.name);
                  setEditingName(true);
                }
              }}
              title="Click to rename"
            >
              {layer.name}
            </span>
          )}
          <button className="layer-remove-btn" onClick={onRemove} title="Remove layer">
            ×
          </button>
        </div>

        {advancedEnabled && (
          <label className="layer-tile-field-row">
            <span className="layer-tile-field-label">Opacity</span>
            <input
              type="range"
              className="layer-tile-opacity-slider"
              min={0}
              max={100}
              step={1}
              value={Math.round(layer.opacity * 100)}
              onChange={(e) => onOpacityChange(parseInt(e.target.value, 10) / 100)}
            />
          </label>
        )}

        {advancedEnabled && (
          <label className="layer-tile-field-row">
            <span className="layer-tile-field-label">Scale</span>
            <input
              type="range"
              className="layer-tile-opacity-slider"
              min={10}
              max={200}
              step={1}
              value={Math.round(layer.scale * 100)}
              onChange={(e) => onScaleChange(parseInt(e.target.value, 10) / 100)}
            />
          </label>
        )}

        {advancedEnabled && (
          <div className="layer-tile-field-row">
            <span className="layer-tile-field-label">Offset</span>
            <span className="layer-tile-offset-inputs">
              <span className="layer-tile-field-label">X</span>
              <input
                type="number"
                className="layer-tile-field-input"
                min={-10000}
                max={10000}
                value={layer.offsetX}
                onChange={(e) => onOffsetChange(clampOffset(parseInt(e.target.value, 10) || 0), layer.offsetY)}
              />
              <span className="layer-tile-field-label">Y</span>
              <input
                type="number"
                className="layer-tile-field-input"
                min={-10000}
                max={10000}
                value={layer.offsetY}
                onChange={(e) => onOffsetChange(layer.offsetX, clampOffset(parseInt(e.target.value, 10) || 0))}
              />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
