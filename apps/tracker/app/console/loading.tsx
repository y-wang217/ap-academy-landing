/** Streamed only after the layout's owner gate passed. Static: reads nothing. A dark frame, so the bridge does not flash light. */
export default function ConsoleLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#100D18] font-mono text-sm text-[#BB9DAF]">
      <p>Loading console</p>
    </div>
  );
}
