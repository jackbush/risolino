import { useState, useCallback, useEffect, useRef } from 'react';
import { PreviewPane } from './components/PreviewPane';
import { SidePanel } from './components/SidePanel';
import { useLayerState, MAX_LAYERS } from './hooks/useLayerState';
import { exportFullRes } from './engine/renderer';
import { importFiles } from './engine/importFiles';
import { useMediaQuery, MOBILE_LAYOUT_QUERY } from './hooks/useMediaQuery';
import { RisoConfig } from './types';
import { ZoomMode } from './hooks/useRenderPipeline';
import './index.css';
import { DropPrompt } from './components/DropPrompt';
import { EmptyBackground } from './components/EmptyBackground';

// The faces index.html loads, in every weight the UI sets text in.
const UI_FONTS = ["1em 'Michroma'", "1em 'Source Code Pro'", "500 1em 'Source Code Pro'"];

export function App() {
  const { layers, ...actions } = useLayerState();
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [composeMode, setComposeMode] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const mobile = useMediaQuery(MOBILE_LAYOUT_QUERY);
  // The UI stays hidden until its fonts are in (or have failed), so text
  // never shows in a fallback face and then jumps; with nothing loaded it
  // also waits for the print behind it, so that comes first.
  const [fontsReady, setFontsReady] = useState(false);
  const [backdropReady, setBackdropReady] = useState(false);
  useEffect(() => {
    Promise.all(UI_FONTS.map((f) => document.fonts.load(f)))
      .catch(() => {})
      .finally(() => setFontsReady(true));
  }, []);

  const [config, setConfig] = useState<RisoConfig>({
    advancedLayerOptionsEnabled: false,
    inkBlendMode: 'km',
    inkSpreadEnabled: true,
    inkSpreadAmount: 1.5,
    registrationJitterEnabled: true,
    registrationJitterAmount: 0.34, // ≈1mm on an A4 long edge — a typical real-machine drift
    registrationJitterSeed: 1,
    halftoneMode: 'am',
    halftoneScale: 2,
    halftoneSpacing: 8,
    halftoneAngle: null,
    kubelkaMunkOrderBias: 0.3,
    paperColor: '#FFFDF5',
    paperSize: 'largest',
    layerFit: 'off',
    margin: 0,
    safeArea: 0,
  });
  const [isDragOver, setIsDragOver] = useState(false);
  // Esc abandons the drag in progress: the overlay goes, and letting go
  // afterwards adds nothing. A drag that re-enters the window starts afresh.
  // A ref, so it survives the effect below re-subscribing on re-render.
  const dragAbortedRef = useRef(false);

  function handleConfigChange(updates: Partial<RisoConfig>) {
    setConfig((prev) => ({ ...prev, ...updates }));
  }

  function enterCompose() {
    setComposeMode(true);
    setZoomMode('fit'); // compose is always fit; no zoom behaviour
  }

  function exitCompose() {
    setComposeMode(false);
    setSelectedLayerId(null);
  }

  const isEmpty = !layers.some((l) => l.grayscaleData);
  const uiReady = fontsReady && (backdropReady || !isEmpty);

  const selectedLayer = composeMode
    ? layers.find((l) => l.id === selectedLayerId) ?? null
    : null;

  const addFiles = useCallback(
    (files: FileList) =>
      importFiles(files, layersRef.current.length, MAX_LAYERS, actions.addLayerWithImage),
    [actions],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  useEffect(() => {
    function onDragEnter(e: DragEvent) {
      if (e.relatedTarget === null) dragAbortedRef.current = false;
    }
    function onDragOver(e: DragEvent) {
      e.preventDefault();
      if (!dragAbortedRef.current) setIsDragOver(true);
    }
    function onDragLeave(e: DragEvent) {
      if (e.relatedTarget === null) setIsDragOver(false);
    }
    function onDrop(e: DragEvent) {
      if (dragAbortedRef.current) {
        e.preventDefault();
        dragAbortedRef.current = false;
        return;
      }
      handleDrop(e);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      dragAbortedRef.current = true;
      setIsDragOver(false);
    }
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleDrop]);

  return (
    <div
      className={`app${mobile ? ' app--mobile' : ''}${isEmpty ? ' app--empty' : ''}${
        zoomMode === 'full' ? ' app--zoom-full' : ''
      }${uiReady ? '' : ' app--loading'}`}
    >
      {isEmpty && (
        <EmptyBackground mobile={mobile} inverted={isDragOver} onReady={() => setBackdropReady(true)} />
      )}
      {isDragOver && (
        <div className="drop-overlay">
          <DropPrompt dropping />
        </div>
      )}
      <PreviewPane
        layers={layers}
        config={config}
        isEmpty={isEmpty}
        mobile={mobile}
        onAddFiles={addFiles}
        zoomMode={zoomMode}
        onZoomModeChange={(m) => {
          if (!composeMode) setZoomMode(m);
        }}
        onExport={() => exportFullRes(layers, config)}
        onRerollJitter={() =>
          handleConfigChange({ registrationJitterSeed: Math.floor(Math.random() * 2 ** 31) })
        }
        composeMode={composeMode}
        selectedLayer={selectedLayer}
        onCompose={enterCompose}
        onExitCompose={exitCompose}
        onSelectLayer={setSelectedLayerId}
        onLayerOffsetChange={actions.updateLayerOffset}
        onLayerScaleChange={actions.updateLayerScale}
      />
      {/* On a phone there's nothing to set until there's artwork, so the
          preview gets the whole screen to ask for some. */}
      {!(mobile && isEmpty) && (
        <SidePanel
          layers={layers}
          isEmpty={isEmpty}
          actions={actions}
          config={config}
          onConfigChange={handleConfigChange}
          onAddFiles={addFiles}
          mobile={mobile}
          composeMode={composeMode}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
        />
      )}
    </div>
  );
}
