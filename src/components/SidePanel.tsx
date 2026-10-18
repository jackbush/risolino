import { Layer, RisoConfig } from '../types';
import { LayerActions } from '../hooks/useLayerState';
import { LayerList } from './LayerList';
import { ConfigPanel } from './ConfigPanel';
import { GUIDE_URL } from '../config/links';

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
      <details className="pane pane--setup" open>
        <summary className="pane-summary">
          Setup
          {/* A link is interactive content, so clicking it opens the guide
              without toggling the pane. */}
          <a
            className="pane-help"
            href={GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Help"
            aria-label="Help"
          >
            [?]
          </a>
        </summary>
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
