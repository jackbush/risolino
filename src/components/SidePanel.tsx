import { useEffect, useRef, useState } from 'react';
import { Layer, RisoConfig } from '../types';
import { LayerActions } from '../hooks/useLayerState';
import { LayerList } from './LayerList';
import { ConfigPanel } from './ConfigPanel';
import { Chevron, NewTabArrow } from './ManualLink';
import { manualUrl } from '../config/links';

interface SidePanelProps {
  layers: Layer[];
  /** No layer has artwork yet. */
  isEmpty: boolean;
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
  isEmpty,
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
  // Folded down to its tabs, leaving the preview the screen.
  const [collapsed, setCollapsed] = useState(false);
  // Desktop Setup stays folded until there's artwork to set up, and opens
  // when the first layer lands (folding again if they all go). In between
  // it's the user's to open and close.
  const [setupOpen, setSetupOpen] = useState(!isEmpty);
  useEffect(() => setSetupOpen(!isEmpty), [isEmpty]);
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
        <div className={`pane pane--tabbed pane--tab-${tab}${collapsed ? ' pane--collapsed' : ''}`}>
          <div className="pane-header">
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
                  onClick={() => {
                    setTab(t.id);
                    setCollapsed(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="pane-collapse"
              aria-expanded={!collapsed}
              aria-controls="tab-panel"
              aria-label={collapsed ? 'Show controls' : 'Hide controls'}
              onClick={() => setCollapsed((c) => !c)}
            >
              <Chevron className="pane-chevron" />
            </button>
          </div>
          {!collapsed && (
            <div className="pane-body" role="tabpanel" id="tab-panel" aria-labelledby={`tab-${tab}`}>
              {tab === 'layers' ? (
                layerList
              ) : (
                <ConfigPanel config={config} onChange={onConfigChange} />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="side-panel">
      <a className="pane manual-card" href={manualUrl('start')} target="_blank" rel="noopener noreferrer">
        Manual
        <NewTabArrow className="manual-card-icon" size={20} />
        <span className="visually-hidden">(opens in a new tab)</span>
      </a>

      <details
        className="pane pane--setup"
        open={setupOpen}
        onToggle={(e) => setSetupOpen(e.currentTarget.open)}
      >
        <summary className="pane-summary">
          Setup
          <Chevron className="pane-chevron" />
        </summary>
        <div className="pane-body">
          {isEmpty ? (
            <p className="pane-note">Add a layer to set up your print.</p>
          ) : (
            <ConfigPanel config={config} onChange={onConfigChange} />
          )}
        </div>
      </details>

      <details className="pane pane--layers" open>
        <summary className="pane-summary">
          Layers
          <Chevron className="pane-chevron" />
        </summary>
        <div className="pane-body">{layerList}</div>
      </details>
    </div>
  );
}
