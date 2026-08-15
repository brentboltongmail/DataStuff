import React, { useEffect, useMemo, useRef, useState } from "react";

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

interface Point {
  x: number;
  y: number;
}

interface DancerPoint {
  x: number;
  y: number;
  part: "head" | "torso" | "left-arm" | "right-arm" | "left-leg" | "right-leg" | "stage";
  dancerIndex: 0 | 1 | 2;
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

function generateSadFacePositions(count: number): Point[] {
  const points: Point[] = [];

  // 1. Left Eye (14 stars in a circle at 35%, 33%)
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    points.push({
      x: 35 + Math.cos(angle) * 4.2,
      y: 33 + Math.sin(angle) * 4.2,
    });
  }

  // 2. Right Eye (14 stars in a circle at 65%, 33%)
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    points.push({
      x: 65 + Math.cos(angle) * 4.2,
      y: 33 + Math.sin(angle) * 4.2,
    });
  }

  // 3. Sad Mouth / Frown Arc (28 stars)
  for (let i = 0; i < 28; i++) {
    const t = i / 27;
    const x = 27 + t * 46;
    const norm = (x - 50) / 23;
    const y = 56 + 14 * (norm * norm);
    points.push({ x, y });
  }

  // 4. Outer Face Circle (remaining stars)
  const remaining = count - points.length;
  for (let i = 0; i < remaining; i++) {
    const angle = (i / remaining) * Math.PI * 2;
    points.push({
      x: 50 + Math.cos(angle) * 33,
      y: 50 + Math.sin(angle) * 33,
    });
  }

  return points;
}

function generateDancerPositions(count: number): DancerPoint[] {
  const points: DancerPoint[] = [];
  const centers = [22, 50, 78];

  centers.forEach((cx, dIndex) => {
    const dancerIndex = dIndex as 0 | 1 | 2;

    // 1. Head (8 stars in circle at cx, 30%)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      points.push({
        x: cx + Math.cos(angle) * 3.8,
        y: 30 + Math.sin(angle) * 3.8,
        part: "head",
        dancerIndex,
      });
    }

    // 2. Torso (5 stars in line Y = 36% to 52%)
    for (let i = 0; i < 5; i++) {
      points.push({
        x: cx,
        y: 36 + (i / 4) * 16,
        part: "torso",
        dancerIndex,
      });
    }

    // 3. Left Arm (4 stars)
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 4;
      points.push({
        x: cx - t * 7.5,
        y: 39 - t * 5,
        part: "left-arm",
        dancerIndex,
      });
    }

    // 4. Right Arm (4 stars)
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 4;
      points.push({
        x: cx + t * 7.5,
        y: 39 - t * 5,
        part: "right-arm",
        dancerIndex,
      });
    }

    // 5. Left Leg (5 stars)
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 5;
      points.push({
        x: cx - t * 5.5,
        y: 52 + t * 16,
        part: "left-leg",
        dancerIndex,
      });
    }

    // 6. Right Leg (5 stars)
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 5;
      points.push({
        x: cx + t * 5.5,
        y: 52 + t * 16,
        part: "right-leg",
        dancerIndex,
      });
    }
  });

  // Remaining floor lights (2 stars)
  const remaining = count - points.length;
  for (let i = 0; i < remaining; i++) {
    points.push({
      x: 36 + i * 28,
      y: 72,
      part: "stage",
      dancerIndex: (i % 3) as 0 | 1 | 2,
    });
  }

  return points;
}

export default function ConnectionStarfieldOverlay({
  phase,
  targetRect,
  connectionName,
  onComplete,
}: Props) {
  const [animatingOut, setAnimatingOut] = useState(false);
  const [failedStage, setFailedStage] = useState<"none" | "face" | "melting">("none");
  const [succeededStage, setSucceededStage] = useState<"none" | "dancing" | "suck-in">("none");
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Generate a galaxy of 95 twinkling stars distributed across viewport
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
        delay: parseFloat((Math.random() * 3.0).toFixed(2)),
        duration: parseFloat((Math.random() * 2.8 + 2.2).toFixed(2)),
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
        flyDelay: Math.floor(Math.random() * 400),
        rotate: Math.floor(Math.random() * 45),
      };
    });
  }, []);

  const sadFacePositions = useMemo(() => generateSadFacePositions(95), []);
  const dancerPositions = useMemo(() => generateDancerPositions(95), []);

  // Handle phase transitions
  useEffect(() => {
    if (phase === "succeeded") {
      setAnimatingOut(true);
      setFailedStage("none");

      // 50% chance to trigger stick figure dancers
      const showDancers = Math.random() < 0.5;
      if (showDancers) {
        setSucceededStage("dancing");

        // Dance for 5s (0.5s assembly + 5.0s dance = 5.5s total), then transition to suck-in
        const suckInTimer = setTimeout(() => {
          setSucceededStage("suck-in");
        }, 5500);

        // Complete overall sequence after suck-in finishes (5.5s + 1.1s = 6.6s)
        const endTimer = setTimeout(() => {
          onCompleteRef.current();
        }, 6600);

        return () => {
          clearTimeout(suckInTimer);
          clearTimeout(endTimer);
        };
      } else {
        setSucceededStage("suck-in");
        const timer = setTimeout(() => {
          onCompleteRef.current();
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
    if (phase === "failed") {
      setAnimatingOut(true);
      setSucceededStage("none");
      setFailedStage("face");

      // Hold sad face for 2.1s (0.6s snap + 1.5s hold), then melt down off screen
      const meltTimer = setTimeout(() => {
        setFailedStage("melting");
      }, 2100);

      // Complete total animation after 3.3s
      const endTimer = setTimeout(() => {
        onCompleteRef.current();
      }, 3300);

      return () => {
        clearTimeout(meltTimer);
        clearTimeout(endTimer);
      };
    }
    if (phase === "connecting") {
      setAnimatingOut(false);
      setFailedStage("none");
      setSucceededStage("none");
    }
  }, [phase]);

  if (phase === "idle") return null;

  // Calculate destination X & Y (center of connection button or default fallback)
  const targetX = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth * 0.22;
  const targetY = targetRect ? targetRect.top + targetRect.height / 2 : 24;

  return (
    <div
      className={`starfield-overlay ${phase} ${animatingOut ? "animating-out" : ""} failed-stage-${failedStage} succeeded-stage-${succeededStage}`}
      aria-hidden="true"
    >
      {/* Soft dark translucent galaxy aura backdrop */}
      <div className="starfield-backdrop" />

      {/* Central connection status card with sparkling aura */}
      <div className={`starfield-card ${animatingOut ? "card-fade-out" : ""}`}>
        <div className="starfield-icon-wrap">
          <svg className="starfield-main-star" viewBox="0 0 64 64" width="92" height="92">
            <defs>
              <linearGradient id="star-grad-primary" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e9d5ff" />
                <stop offset="35%" stopColor="#c084fc" />
                <stop offset="70%" stopColor="#f472b6" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
              <linearGradient id="star-grad-secondary" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="40%" stopColor="#ec4899" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <linearGradient id="star-facet-light" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#fef08a" stopOpacity="0.2" />
              </linearGradient>
              <radialGradient id="star-core-flare" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="30%" stopColor="#fef08a" stopOpacity="0.95" />
                <stop offset="70%" stopColor="#ec4899" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
              </radialGradient>
              <filter id="star-drop-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ec4899" floodOpacity="0.85" />
              </filter>
            </defs>

            {/* Outer 12-point sparkling star halo */}
            <path
              d="M32 0L35.5 24L59.5 8L39.5 28.5L64 32L39.5 35.5L59.5 56L35.5 40L32 64L28.5 40L4.5 56L24.5 35.5L0 32L24.5 28.5L4.5 8L28.5 24Z"
              fill="url(#star-grad-secondary)"
              opacity="0.35"
              transform="rotate(15 32 32)"
            />

            {/* Sub-primary 8-point rotating crystal star */}
            <path
              d="M32 4L37 22L55 12L42 27L60 32L42 37L55 52L37 42L32 60L27 42L9 52L22 37L4 32L22 27L9 12L27 22Z"
              fill="url(#star-grad-primary)"
              opacity="0.65"
              transform="rotate(22.5 32 32)"
            />

            {/* Main 4-point crystal star with deep shadows */}
            <path
              d="M32 0L39.5 24.5L64 32L39.5 39.5L32 64L24.5 39.5L0 32L24.5 24.5Z"
              fill="url(#star-grad-primary)"
              filter="url(#star-drop-shadow)"
            />

            {/* 3D Geometric Facet Highlights */}
            <path d="M32 0L39.5 24.5L32 32L24.5 24.5Z" fill="url(#star-facet-light)" />
            <path d="M64 32L39.5 39.5L32 32L39.5 24.5Z" fill="#ffffff" opacity="0.45" />
            <path d="M32 64L24.5 39.5L32 32L39.5 39.5Z" fill="url(#star-grad-secondary)" opacity="0.8" />
            <path d="M0 32L24.5 24.5L32 32L24.5 39.5Z" fill="#e9d5ff" opacity="0.5" />

            {/* Inner Diamond Core Flare */}
            <polygon points="32,16 48,32 32,48 16,32" fill="url(#star-core-flare)" />
            <polygon points="32,20 44,32 32,44 20,32" fill="#ffffff" opacity="0.75" />
            <circle cx="32" cy="32" r="5" fill="#ffffff" />
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

      {/* Twinkling, flying, sad face, or dancing stars */}
      <div className="starfield-container">
        {stars.map((star, index) => {
          // Convert star percentage to screen pixels
          const starPxX = (star.x / 100) * window.innerWidth;
          const starPxY = (star.y / 100) * window.innerHeight;

          // Vector from star to target button
          const deltaX = targetX - starPxX;
          const deltaY = targetY - starPxY;

          // Sad face offsets
          const sadPoint = sadFacePositions[index] || { x: 50, y: 50 };
          const deltaSadX = sadPoint.x - star.x;
          const deltaSadY = sadPoint.y - star.y;

          // Dancer offsets
          const dancerPoint = dancerPositions[index] || { x: 50, y: 50, part: "stage", dancerIndex: 1 };
          const deltaDancerX = dancerPoint.x - star.x;
          const deltaDancerY = dancerPoint.y - star.y;

          const isDancing = phase === "succeeded" && succeededStage === "dancing";
          const isSuckingIn = phase === "succeeded" && succeededStage === "suck-in";
          const isSadFace = phase === "failed" && failedStage === "face";
          const isMelting = phase === "failed" && failedStage === "melting";

          let animClass = "twinkle";
          if (isSuckingIn) animClass = "fly-to-button";
          else if (isDancing) animClass = `dancing fly-to-dancer dance-fig-${dancerPoint.dancerIndex} dance-part-${dancerPoint.part}`;
          else if (isSadFace) animClass = "fly-to-sad-face";
          else if (isMelting) animClass = "melt-down";

          const dancerColors = [
            ["#38bdf8", "#67e8f9", "#7dd3fc"], // Dancer 0: Electric Cyan
            ["#f472b6", "#ec4899", "#f43f5e"], // Dancer 1: Hot Pink
            ["#c084fc", "#fef08a", "#a855f7"], // Dancer 2: Neon Purple & Gold
          ];
          const dancerColor = dancerColors[dancerPoint.dancerIndex][index % 3];

          const style: React.CSSProperties & Record<string, string | number> = {
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            color: isDancing ? dancerColor : isSadFace || isMelting ? "#f472b6" : star.color,
            animationDelay: isMelting
              ? `${(index % 12) * 25}ms`
              : isSadFace
              ? `${(star.flyDelay / 2).toFixed(0)}ms`
              : isDancing
              ? `${(star.flyDelay / 3).toFixed(0)}ms`
              : isSuckingIn
              ? `${star.flyDelay}ms`
              : `${star.delay}s`,
            animationDuration: isMelting
              ? "1100ms"
              : isSadFace
              ? "600ms"
              : isDancing
              ? "500ms"
              : isSuckingIn
              ? "1100ms"
              : `${star.duration}s`,
            transform: `rotate(${star.rotate}deg)`,
            "--delta-x": `${deltaX}px`,
            "--delta-y": `${deltaY}px`,
            "--delta-sad-x": `${deltaSadX}vw`,
            "--delta-sad-y": `${deltaSadY}vh`,
            "--delta-dancer-x": `${deltaDancerX}vw`,
            "--delta-dancer-y": `${deltaDancerY}vh`,
            "--star-y-vh": `${star.y}vh`,
          };

          return (
            <div
              key={star.id}
              className={`magic-star ${star.type} ${animClass}`}
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
