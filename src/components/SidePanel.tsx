import { Layer, RisoConfig } from '../types';
import { LayerActions } from '../hooks/useLayerState';
import { LayerList } from './LayerList';
import { ConfigPanel } from './ConfigPanel';
import { manualUrl } from '../config/links';

interface SidePanelProps {
  layers: Layer[];
  actions: LayerActions;
  config: RisoConfig;
  onConfigChange: (updates: Partial<RisoConfig>) => void;
  composeMode: boolean;
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
}

export function SidePanel({
  layers,
  actions,
  config,
  onConfigChange,
  composeMode,
  selectedLayerId,
  onSelectLayer,
}: SidePanelProps) {
  return (
    <div className="side-panel">
      <a className="pane manual-card" href={manualUrl('page')} target="_blank" rel="noopener noreferrer">
        Manual
        <svg className="manual-card-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <path d="M7 4.5h8.5V13M15.5 4.5 4.5 15.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
        </svg>
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
        <div className="pane-body">
          <LayerList
            layers={layers}
            actions={actions}
            advancedEnabled={config.advancedLayerOptionsEnabled}
            onAdvancedChange={(enabled) => onConfigChange({ advancedLayerOptionsEnabled: enabled })}
            paperColor={config.paperColor}
            composeMode={composeMode}
            selectedLayerId={selectedLayerId}
            onSelectLayer={onSelectLayer}
          />
        </div>
      </details>

    </div>
  );
}
