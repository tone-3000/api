// src/components/EmbeddedFlowSheet.tsx
import type { EmbeddedFlow } from '../useEmbeddedFlow';
import { Spinner } from './Spinner';

/** Modal sheet that hosts the embedded TONE3000 view while a flow runs. */
export function EmbeddedFlowSheet({ flow, title = 'TONE3000' }: { flow: EmbeddedFlow; title?: string }) {
  if (!flow.active) return null;
  return (
    <div className="flow-overlay">
      <div className="flow-sheet">
        <div className="flow-sheet-header">
          <span className="flow-sheet-title">{title}</span>
          <button className="btn btn-ghost btn-small" onClick={flow.cancel}>Close</button>
        </div>
        {/* The native view is placed over this element; the spinner shows until it paints. */}
        <div ref={flow.hostRef} className="flow-sheet-body">
          <Spinner />
        </div>
      </div>
    </div>
  );
}
