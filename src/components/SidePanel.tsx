import { useRef, useState } from 'react';
import { Layer, RisoConfig } from '../types';
import { LayerActions } from '../hooks/useLayerState';
import { LayerList } from './LayerList';
import { ConfigPanel } from './ConfigPanel';
import { NewTabArrow } from './ManualLink';
import { manualUrl } from '../config/links';

interface SidePanelProps {
  layers: Layer[];
  actions: LayerActions;
  config: RisoConfig;
  onConfigChange: (updates: Partial<RisoConfig>) => void;
  onAddFiles: (files: FileList) => void;
  /** Stacked layout: one pane with Layers/Setup tabs instead of two side by side. */
  mobile: boolean;
  composeMode: boolean;
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
}

const TABS = [
  { id: 'layers', label: 'Layers' },
  { id: 'setup', label: 'Setup' },
] as const;

type Tab = (typeof TABS)[number]['id'];

export function SidePanel({
  layers,
  actions,
  config,
  onConfigChange,
  onAddFiles,
  mobile,
  composeMode,
  selectedLayerId,
  onSelectLayer,
}: SidePanelProps) {
  // Layers first: with nothing loaded, adding artwork is the only next step.
  const [tab, setTab] = useState<Tab>('layers');
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const layerList = (
    <LayerList
      layers={layers}
      actions={actions}
      onAddFiles={onAddFiles}
      advancedEnabled={config.advancedLayerOptionsEnabled}
      onAdvancedChange={(enabled) => onConfigChange({ advancedLayerOptionsEnabled: enabled })}
      paperColor={config.paperColor}
      composeMode={composeMode}
      selectedLayerId={selectedLayerId}
      onSelectLayer={onSelectLayer}
    />
  );

  if (mobile) {
    // Arrow keys move between tabs, as in any tab list.
    function handleTabKeyDown(e: React.KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const i = TABS.findIndex((t) => t.id === tab);
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
      setTab(next);
      tabRefs.current[next]?.focus();
    }

    return (
      <div className="side-panel">
        <div className={`pane pane--tabbed pane--tab-${tab}`}>
          <div className="pane-tabs" role="tablist" aria-label="Controls" onKeyDown={handleTabKeyDown}>
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                className="pane-tab"
                aria-selected={tab === t.id}
                aria-controls="tab-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="pane-body" role="tabpanel" id="tab-panel" aria-labelledby={`tab-${tab}`}>
            {tab === 'layers' ? (
              layerList
            ) : (
              <ConfigPanel config={config} onChange={onConfigChange} />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="side-panel">
      <a className="pane manual-card" href={manualUrl('page')} target="_blank" rel="noopener noreferrer">
        Manual
        <NewTabArrow className="manual-card-icon" size={20} />
        <span className="visually-hidden">(opens in a new tab)</span>
      </a>

      <details className="pane pane--setup" open>
        <summary className="pane-summary">Setup</summary>
        <div className="pane-body">
          <ConfigPanel config={config} onChange={onConfigChange} />
        </div>
      </details>

      <details className="pane pane--layers" open>
        <summary className="pane-summary">Layers</summary>
        <div className="pane-body">{layerList}</div>
      </details>
    </div>
  );
}
