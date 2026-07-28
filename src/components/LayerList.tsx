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
import { loadImageFile, isHeicFile } from '../engine/imageLoader';
import { loadPdfFile } from '../engine/pdfLoader';

interface LayerListProps {
  layers: Layer[];
  actions: LayerActions;
  advancedEnabled: boolean;
  paperColor?: string;
  composeMode: boolean;
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
}

export function LayerList({
  layers,
  actions,
  advancedEnabled,
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
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type === 'application/pdf') {
        loadPdfFile(file, layers.length, MAX_LAYERS).then(
          (pages) => pages.forEach((p) => actions.addLayerWithImage(p.grayscaleData)),
          (err) => alert(err instanceof Error ? err.message : 'Failed to load PDF'),
        );
      } else if (file.type.startsWith('image/') || isHeicFile(file)) {
        loadImageFile(file).then(
          (result) => actions.addLayerWithImage(result.grayscaleData),
          (err) => alert(err instanceof Error ? err.message : 'Failed to load image'),
        );
      }
    }
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
        accept="image/*,.heic,.heif,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />
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
