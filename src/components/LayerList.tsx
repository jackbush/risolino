import { useRef } from 'react';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Layer, InkColor } from '../types';
import { LayerActions, MAX_LAYERS } from '../hooks/useLayerState';
import { LayerTile } from './LayerTile';
import { ManualLink } from './ManualLink';
import { IMPORT_ACCEPT } from '../engine/importFiles';

interface LayerListProps {
  layers: Layer[];
  actions: LayerActions;
  onAddFiles: (files: FileList) => void;
  advancedEnabled: boolean;
  onAdvancedChange: (enabled: boolean) => void;
  paperColor?: string;
  composeMode: boolean;
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
}

export function LayerList({
  layers,
  actions,
  onAddFiles,
  advancedEnabled,
  onAdvancedChange,
  paperColor,
  composeMode,
  selectedLayerId,
  onSelectLayer,
}: LayerListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      actions.reorderLayers(String(active.id), String(over.id));
    }
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) onAddFiles(e.target.files);
    e.target.value = '';
  }

  return (
    <div className="layer-list">
      <div className="layer-list-items">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={layers.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            {layers.map((layer) => (
              <LayerTile
                key={layer.id}
                layer={layer}
                advancedEnabled={advancedEnabled}
                paperColor={paperColor}
                composeMode={composeMode}
                selected={selectedLayerId === layer.id}
                onSelect={() => onSelectLayer(layer.id)}
                onRemove={() => actions.removeLayer(layer.id)}
                onNameChange={(name: string) => actions.updateLayerName(layer.id, name)}
                onColorChange={(ink: InkColor) => actions.updateLayerColor(layer.id, ink)}
                onOpacityChange={(opacity: number) => actions.updateLayerOpacity(layer.id, opacity)}
                onScaleChange={(scale: number) => actions.updateLayerScale(layer.id, scale)}
                onOffsetChange={(x: number, y: number) => actions.updateLayerOffset(layer.id, x, y)}
                onImageUpload={(grayscaleData: ImageData) =>
                  actions.setLayerImage(layer.id, grayscaleData)
                }
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />
      {/* Only worth showing once there's a layer for it to act on. */}
      {layers.length > 0 && (
        <div className="config-item config-item--row layer-list-advanced">
          <span className="config-label">
            <label htmlFor="advanced-layer-options">Advanced layer options</label>
            <ManualLink page="layers" topic="Layer options" />
          </span>
          <input
            id="advanced-layer-options"
            type="checkbox"
            checked={advancedEnabled}
            onChange={(e) => onAdvancedChange(e.target.checked)}
          />
        </div>
      )}
      <button
        className="layer-list-add-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={layers.length >= MAX_LAYERS}
      >
        {layers.length >= MAX_LAYERS ? 'Max layers reached' : 'Add layers'}
      </button>
    </div>
  );
}
