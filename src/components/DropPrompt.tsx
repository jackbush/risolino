import { useRef } from 'react';
import { IMPORT_ACCEPT } from '../engine/importFiles';

interface DropPromptProps {
  /** Something is being dragged over the window right now. */
  dropping: boolean;
  /** Offer a file picker too, for screens with nothing to drag from. */
  onChooseFiles?: (files: FileList) => void;
}

/**
 * The big type set on the table: the empty state, and the drop overlay's
 * message. One component so the two sit pixel for pixel in the same place,
 * and only the verb and the colours change when a drag arrives.
 */
export function DropPrompt({ dropping, onChooseFiles }: DropPromptProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = dropping ? 'Drop in' : onChooseFiles ? 'Add' : 'Drag in';

  return (
    <div className={`drop-prompt${dropping ? ' drop-prompt--dropping' : ''}`}>
      {/* A card of its own on a phone; plain type on the table otherwise. */}
      <div className="drop-prompt-content">
        <h1 className="drop-prompt-title">
          {`${opener} images`}
          <br />
          or a PDF
        </h1>
        {onChooseFiles && (
          <>
            <p className="drop-prompt-body">Snap a drawing, or pick one from your files.</p>
            <input
              ref={inputRef}
              type="file"
              accept={IMPORT_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) onChooseFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button type="button" className="drop-prompt-action" onClick={() => inputRef.current?.click()}>
              Choose files
            </button>
          </>
        )}
      </div>
    </div>
  );
}
