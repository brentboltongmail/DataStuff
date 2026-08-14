import React, { useEffect, useMemo, useState } from "react";

export type ConnectPhase = "idle" | "connecting" | "succeeded" | "failed";

interface Props {
  phase: ConnectPhase;
  targetRect: DOMRect | null;
  connectionName?: string;
  onComplete: () => void;
}

interface Star {
  id: number;
  x: number; // Viewport X in percentage (0 to 100)
  y: number; // Viewport Y in percentage (0 to 100)
  size: number; // Size in px (8 to 26)
  type: "star4" | "diamond" | "cross" | "dot";
  delay: number; // Twinkle delay in seconds (0 to 1.5)
  duration: number; // Twinkle loop duration (1 to 2.5)
  color: string;
  flyDelay: number; // Flight stagger in ms (0 to 220)
  rotate: number; // Rotation deg
}

const STAR_COLORS = [
  "#ffffff",
  "#c084fc",
  "#a5f3fc",
  "#fef08a",
  "#67e8f9",
  "#f472b6",
  "#e0e7ff",
];

export default function ConnectionStarfieldOverlay({
  phase,
  targetRect,
  connectionName,
  onComplete,
}: Props) {
  const [animatingOut, setAnimatingOut] = useState(false);

  // Generate a galaxy of 90 twinkling stars distributed across viewport
  const stars: Star[] = useMemo(() => {
    return Array.from({ length: 95 }, (_, i) => {
      const typeRand = Math.random();
      const type: Star["type"] =
        typeRand < 0.4 ? "star4" : typeRand < 0.7 ? "diamond" : typeRand < 0.85 ? "cross" : "dot";
      return {
        id: i,
        x: Math.random() * 96 + 2,
        y: Math.random() * 96 + 2,
        size: Math.floor(Math.random() * 18 + 8),
        type,
        delay: parseFloat((Math.random() * 1.5).toFixed(2)),
        duration: parseFloat((Math.random() * 1.4 + 1.1).toFixed(2)),
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
        flyDelay: Math.floor(Math.random() * 200),
        rotate: Math.floor(Math.random() * 45),
      };
    });
  }, []);

  // Handle phase transitions
  useEffect(() => {
    if (phase === "succeeded") {
      setAnimatingOut(true);
      const timer = setTimeout(() => {
        onComplete();
      }, 750);
      return () => clearTimeout(timer);
    }
    if (phase === "failed") {
      setAnimatingOut(true);
      const timer = setTimeout(() => {
        onComplete();
      }, 350);
      return () => clearTimeout(timer);
    }
    if (phase === "connecting") {
      setAnimatingOut(false);
    }
  }, [phase, onComplete]);

  if (phase === "idle") return null;

  // Calculate destination X & Y (center of connection button or default fallback)
  const targetX = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth * 0.22;
  const targetY = targetRect ? targetRect.top + targetRect.height / 2 : 24;

  return (
    <div
      className={`starfield-overlay ${phase} ${animatingOut ? "animating-out" : ""}`}
      aria-hidden="true"
    >
      {/* Soft dark translucent galaxy aura backdrop */}
      <div className="starfield-backdrop" />

      {/* Central connection status card with sparkling aura */}
      <div className={`starfield-card ${animatingOut ? "card-fade-out" : ""}`}>
        <div className="starfield-icon-wrap">
          <svg className="starfield-main-star" viewBox="0 0 24 24" width="36" height="36">
            <path
              d="M12 0L14.7 9.3L24 12L14.7 14.7L12 24L9.3 14.7L0 12L9.3 9.3Z"
              fill="url(#star-grad)"
            />
            <defs>
              <linearGradient id="star-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="50%" stopColor="#ec4899" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="starfield-text-group">
          <span className="starfield-title">
            {phase === "succeeded"
              ? "Connection Established!"
              : phase === "failed"
              ? "Connection Failed"
              : `Connecting${connectionName ? ` to ${connectionName}` : "..."}`}
          </span>
          <span className="starfield-sub">
            {phase === "succeeded"
              ? "Synthesizing session session stream..."
              : "Verifying credentials & establishing secure socket channel"}
          </span>
        </div>
      </div>

      {/* Twinkling & flying stars */}
      <div className="starfield-container">
        {stars.map((star) => {
          // Convert star percentage to screen pixels
          const starPxX = (star.x / 100) * window.innerWidth;
          const starPxY = (star.y / 100) * window.innerHeight;

          // Vector from star to target button
          const deltaX = targetX - starPxX;
          const deltaY = targetY - starPxY;

          const isFlying = phase === "succeeded";

          const style: React.CSSProperties & Record<string, string | number> = {
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            color: star.color,
            animationDelay: isFlying ? `${star.flyDelay}ms` : `${star.delay}s`,
            animationDuration: isFlying ? "550ms" : `${star.duration}s`,
            transform: `rotate(${star.rotate}deg)`,
            "--delta-x": `${deltaX}px`,
            "--delta-y": `${deltaY}px`,
          };

          return (
            <div
              key={star.id}
              className={`magic-star ${star.type} ${isFlying ? "fly-to-button" : "twinkle"}`}
              style={style}
            >
              {star.type === "star4" && (
                <svg viewBox="0 0 24 24" width="100%" height="100%">
                  <path
                    d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z"
                    fill="currentColor"
                  />
                </svg>
              )}
              {star.type === "diamond" && (
                <svg viewBox="0 0 24 24" width="100%" height="100%">
                  <polygon points="12,1 23,12 12,23 1,12" fill="currentColor" />
                </svg>
              )}
              {star.type === "cross" && (
                <svg viewBox="0 0 24 24" width="100%" height="100%">
                  <path
                    d="M11 0h2v9h9v2h-9v9h-2v-9H0V9h9V0z"
                    fill="currentColor"
                  />
                </svg>
              )}
              {star.type === "dot" && (
                <div
                  className="magic-dot"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    backgroundColor: "currentColor",
                    boxShadow: `0 0 8px ${star.color}`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
