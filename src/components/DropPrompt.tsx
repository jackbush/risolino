interface DropPromptProps {
  /** Something is being dragged over the window right now. */
  dropping: boolean;
}

/**
 * The big type set on the table: the empty state, and the drop overlay's
 * message. One component so the two sit pixel for pixel in the same place,
 * and only the verb and the colours change when a drag arrives.
 */
export function DropPrompt({ dropping }: DropPromptProps) {
  return (
    <div className={`drop-prompt${dropping ? ' drop-prompt--dropping' : ''}`}>
      <h1 className="drop-prompt-title">
        {dropping ? 'Drop' : 'Drag'} in images
        <br />
        or a PDF
      </h1>
      <p className="drop-prompt-body">Each image or page becomes an ink layer.</p>
    </div>
  );
}
