import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { useStoreSettings } from "../useStore";
import { useReducedMotion } from "../useReducedMotion";

export function SunHillMark() {
  return <svg className="sun-hill-mark" viewBox="0 0 80 40" aria-hidden="true"><circle cx="65" cy="12" r="9" className="mark-sun" /><path d="M3 36C15 31 22 29 29 23C36 17 41 17 49 24C57 31 68 32 77 36C59 34 27 34 3 36Z" className="mark-hill" /></svg>;
}

// A slow strip of the mission lines. The moving copy has a pause button (WCAG 2.2.2); with reduced
// motion the lines sit still, once, with no duplicate.
export function MissionMarquee() {
  const { tagline, mission } = useStoreSettings();
  const lines = [tagline, ...mission];
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const copy = (hidden: boolean) => (
    <div className="mission-track-copy" aria-hidden={hidden || undefined}>
      {lines.map((line) => <span key={line}><SunHillMark />{line}</span>)}
    </div>
  );
  return (
    <section className="mission-marquee" aria-label="Our mission" data-paused={paused || undefined} data-static={reduce || undefined}>
      <div className="mission-viewport">
        <div className="mission-track">{copy(false)}{!reduce && copy(true)}</div>
      </div>
      {!reduce && (
        <button type="button" className="mission-toggle" aria-pressed={paused} aria-label="Pause the moving mission text" onClick={() => setPaused(!paused)}>
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>
      )}
    </section>
  );
}
