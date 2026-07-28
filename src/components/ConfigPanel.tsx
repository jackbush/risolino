import { useState, useEffect, useRef } from 'react';
import { RisoConfig } from '../types';
import { JITTER_MAX_PCT } from '../engine/compositor';

const PAPER_PRESETS = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Eggshell', hex: '#FFFDF5' },
  { name: 'Natural', hex: '#F2ECD9' },
  { name: 'Stone', hex: '#DDD9CF' },
  { name: 'Newsprint', hex: '#C8C4B4' },
];

interface ConfigPanelProps {
  config: RisoConfig;
  onChange: (updates: Partial<RisoConfig>) => void;
}

export function ConfigPanel({ config, onChange }: ConfigPanelProps) {
  const [hexInput, setHexInput] = useState(config.paperColor);
  const [showPaperPalette, setShowPaperPalette] = useState(false);
  const paperControlRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setHexInput(config.paperColor);
  }, [config.paperColor]);

  useEffect(() => {
    if (!showPaperPalette) return;
    function handleMouseDown(e: MouseEvent) {
      if (paperControlRef.current && !paperControlRef.current.contains(e.target as Node)) {
        setShowPaperPalette(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showPaperPalette]);

  return (
    <>
      {/* Paper size */}
      <label className="config-item config-item--row">
        <span className="config-label">Paper size</span>
        <select
          value={config.paperSize}
          onChange={(e) =>
            onChange({ paperSize: e.target.value as RisoConfig['paperSize'] })
          }
        >
          <option value="largest">Largest layer</option>
          <option value="smallest">Smallest layer</option>
          <option value="a3">Zine (A3 300dpi)</option>
          <option value="a4">Drawing (A4 300dpi)</option>
          <option value="ogimage">OG:Image (1200×630px)</option>
        </select>
      </label>

      {/* Paper color */}
      <div className="config-item config-item--row">
        <span className="config-label">Paper color</span>
        <span className="paper-color-control" ref={paperControlRef}>
          <button
            type="button"
            className="paper-color-swatch"
            style={{ backgroundColor: config.paperColor }}
            title="Paper presets"
            onClick={() => setShowPaperPalette((s) => !s)}
          />
          <input
            type="text"
            value={hexInput}
            onChange={(e) => {
              const v = e.target.value;
              setHexInput(v);
              if (/^#[0-9A-Fa-f]{6}$/.test(v.trim())) onChange({ paperColor: v.trim() });
            }}
            maxLength={7}
            className="config-inline-input"
            spellCheck={false}
          />
          {showPaperPalette && (
            <div className="paper-palette">
              {PAPER_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  className={`paper-preset-swatch${config.paperColor.toUpperCase() === preset.hex.toUpperCase() ? ' paper-preset-swatch--active' : ''}`}
                  style={{ backgroundColor: preset.hex }}
                  title={preset.name}
                  onClick={() => {
                    onChange({ paperColor: preset.hex });
                    setShowPaperPalette(false);
                  }}
                />
              ))}
            </div>
          )}
        </span>
      </div>

      {/* Scale layers */}
      <label className="config-item config-item--row">
        <span className="config-label">Scale layers</span>
        <select
          value={config.layerFit}
          onChange={(e) =>
            onChange({ layerFit: e.target.value as RisoConfig['layerFit'] })
          }
        >
          <option value="off">Off</option>
          <option value="fit">Fit</option>
          <option value="fill">Fill</option>
        </select>
      </label>

      {/* Margin */}
      <label className="config-item config-item--row">
        <span className="config-label">Margin (px)</span>
        <input
          type="number"
          min={0}
          max={500}
          step={10}
          value={config.margin}
          onChange={(e) =>
            onChange({ margin: Math.min(500, Math.max(0, parseInt(e.target.value, 10) || 0)) })
          }
          className="config-inline-input"
        />
      </label>

      {/* Safe area */}
      <label className="config-item config-item--row">
        <span className="config-label">Safe area (px)</span>
        <input
          type="number"
          min={0}
          max={500}
          step={10}
          value={config.safeArea}
          onChange={(e) =>
            onChange({ safeArea: Math.min(500, Math.max(0, parseInt(e.target.value, 10) || 0)) })
          }
          className="config-inline-input"
        />
      </label>

      {/* Ink spread */}
      <label className="config-item config-item--row">
        <span className="config-label">Ink spread</span>
        <input
          type="checkbox"
          checked={config.inkSpreadEnabled}
          onChange={(e) => onChange({ inkSpreadEnabled: e.target.checked })}
        />
      </label>
      {config.inkSpreadEnabled && (
        <label className="config-item config-item--row">
          <span className="config-label">↳ Spread amount</span>
          <input
            type="range"
            min={0}
            max={5}
            step={0.5}
            value={config.inkSpreadAmount}
            onChange={(e) => onChange({ inkSpreadAmount: parseFloat(e.target.value) })}
          />
        </label>
      )}

      {/* Shading (halftone) */}
      <label className="config-item config-item--row">
        <span className="config-label">Shading</span>
        <select
          value={config.halftoneMode}
          onChange={(e) =>
            onChange({ halftoneMode: e.target.value as RisoConfig['halftoneMode'] })
          }
        >
          <option value="am">Dot screen</option>
          <option value="stochastic">Grain</option>
          <option value="off">Gradient</option>
        </select>
      </label>
      {config.halftoneMode === 'stochastic' && (
        <label className="config-item config-item--row">
          <span className="config-label">↳ Grain size</span>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={config.halftoneScale}
            onChange={(e) => onChange({ halftoneScale: parseInt(e.target.value, 10) })}
          />
        </label>
      )}
      {config.halftoneMode === 'am' && (
        <>
          <label className="config-item config-item--row">
            <span className="config-label">↳ Dot spacing</span>
            <input
              type="range"
              min={4}
              max={40}
              step={1}
              value={config.halftoneSpacing}
              onChange={(e) => onChange({ halftoneSpacing: parseInt(e.target.value, 10) })}
            />
          </label>
          <label className="config-item config-item--row">
            <span className="config-label">↳ Auto angles</span>
            <input
              type="checkbox"
              checked={config.halftoneAngle === null}
              onChange={(e) => onChange({ halftoneAngle: e.target.checked ? null : 45 })}
            />
          </label>
          {config.halftoneAngle !== null && (
            <label className="config-item config-item--row">
              <span className="config-label">↳ Screen angle (°)</span>
              <input
                type="range"
                min={0}
                max={90}
                step={1}
                value={config.halftoneAngle}
                onChange={(e) => onChange({ halftoneAngle: parseInt(e.target.value, 10) })}
              />
            </label>
          )}
        </>
      )}

      {/* Registration jitter */}
      <label className="config-item config-item--row">
        <span className="config-label">Registration jitter</span>
        <input
          type="checkbox"
          checked={config.registrationJitterEnabled}
          onChange={(e) => onChange({ registrationJitterEnabled: e.target.checked })}
        />
      </label>
      {config.registrationJitterEnabled && (
        <label className="config-item config-item--row">
          <span className="config-label">↳ Jitter amount (%)</span>
          <input
            type="range"
            min={0}
            max={JITTER_MAX_PCT}
            step={0.02}
            value={config.registrationJitterAmount}
            onChange={(e) => onChange({ registrationJitterAmount: parseFloat(e.target.value) })}
          />
        </label>
      )}

      {/* Ink blending */}
      <label className="config-item config-item--row">
        <span className="config-label">Ink blending</span>
        <select
          value={config.inkBlendMode}
          onChange={(e) =>
            onChange({ inkBlendMode: e.target.value as RisoConfig['inkBlendMode'] })
          }
        >
          <option value="km">Realistic</option>
          <option value="simple">Simple</option>
          <option value="off">Off</option>
        </select>
      </label>
      {config.inkBlendMode === 'km' && (
        <label className="config-item config-item--row">
          <span className="config-label">↳ Order weight</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={config.kubelkaMunkOrderBias}
            onChange={(e) => onChange({ kubelkaMunkOrderBias: parseFloat(e.target.value) })}
          />
        </label>
      )}

      {/* Advanced layer options */}
      <label className="config-item config-item--row">
        <span className="config-label">Advanced layer options</span>
        <input
          type="checkbox"
          checked={config.advancedLayerOptionsEnabled}
          onChange={(e) => onChange({ advancedLayerOptionsEnabled: e.target.checked })}
        />
      </label>
    </>
  );
}
