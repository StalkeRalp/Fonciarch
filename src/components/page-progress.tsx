"use client";

import { useEffect, useRef, useState } from "react";

/** Indicateur indéterminé : termine uniquement lorsque le travail est terminé. */
export function PageProgress({ active }: { active: boolean }) {
  const [progress, setProgress] = useState(active ? 8 : 0);
  const [visible, setVisible] = useState(active);
  const startedAt = useRef(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let finish: ReturnType<typeof setTimeout> | undefined;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      if (active) {
        startedAt.current = performance.now();
        setVisible(true);
        setProgress(value => value >= 100 || value === 0 ? 8 : value);
        interval = setInterval(() => setProgress(value => value + (90 - value) * 0.12), 180);
      } else {
        // Laisser les transitions rapides perceptibles sans retarder la page.
        finish = setTimeout(() => {
          setProgress(100);
          hide = setTimeout(() => { setVisible(false); setProgress(0); }, 240);
        }, Math.max(0, 260 - (performance.now() - startedAt.current)));
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      clearTimeout(finish);
      clearTimeout(hide);
    };
  }, [active]);

  return <div className={`page-progress ${visible ? "is-visible" : ""}`} role="progressbar" aria-label="Chargement en cours" aria-valuetext={active ? "Chargement en cours" : "Chargement terminé"} aria-hidden={!visible}><span style={{ transform: `scaleX(${progress / 100})` }} /></div>;
}
