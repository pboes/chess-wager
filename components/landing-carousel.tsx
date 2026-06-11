"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const SLIDES = [
  { src: "/landing_page.png", caption: "Your Crowns, your score, one tap to start." },
  { src: "/create_challenge.png", caption: "Challenge anyone on Lichess — longer game, bigger stake." },
  { src: "/challenge_card.png", caption: "Send the invite; they accept and match your stake." },
  { src: "/challenge_closeup.png", caption: "Track your open games — winner takes the Crowns." },
];

/** A peek inside the app — real screenshots, auto-advancing until the user takes over. */
export function LandingCarousel() {
  const [i, setI] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const n = SLIDES.length;

  React.useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((p) => (p + 1) % n), 4500);
    return () => clearInterval(t);
  }, [paused, n]);

  const goto = (idx: number) => {
    setPaused(true);
    setI((idx + n) % n);
  };

  return (
    <div className="space-y-2">
      <p className="text-center text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        A peek inside
      </p>
      <div className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)]">
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {SLIDES.map((s, idx) => (
            <div key={s.src} className="w-full shrink-0">
              <div className="flex aspect-[16/10] items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.src}
                  alt={s.caption}
                  loading={idx === 0 ? "eager" : "lazy"}
                  className="max-h-full max-w-full rounded object-contain"
                />
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => goto(i - 1)}
          aria-label="Previous"
          className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => goto(i + 1)}
          aria-label="Next"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="min-h-[2.5em] text-center text-xs text-[var(--muted-foreground)]">
        {SLIDES[i].caption}
      </p>
      <div className="flex justify-center gap-1.5">
        {SLIDES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goto(idx)}
            aria-label={`Slide ${idx + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              idx === i ? "w-4 bg-[var(--primary)]" : "w-1.5 bg-[var(--border)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
