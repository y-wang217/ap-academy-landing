/** The rail's keyboard help. ModeProvider opens it on ?. */
export function ShortcutHelp() {
  return (
    <details data-shortcuts="" className="console-shortcuts">
      <summary>Keyboard shortcuts</summary>
      <dl>
        <div>
          <dt>Arrow keys, Home, End</dt>
          <dd>Move between the mode tabs</dd>
        </div>
        <div>
          <dt>1, 2, 3</dt>
          <dd>Sales, Creation, Operations</dd>
        </div>
        <div>
          <dt>Tab</dt>
          <dd>Next panel or link</dd>
        </div>
        <div>
          <dt>Up, Down, Home, End</dt>
          <dd>Move in the lead queue</dd>
        </div>
        <div>
          <dt>Enter</dt>
          <dd>Open the selected lead in Notion</dd>
        </div>
        <div>
          <dt>/</dt>
          <dd>Focus the queue filter</dd>
        </div>
        <div>
          <dt>?</dt>
          <dd>Open this list</dd>
        </div>
      </dl>
    </details>
  );
}
