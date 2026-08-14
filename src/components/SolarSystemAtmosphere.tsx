import React, { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: string;
}

const STAR_COLORS = [
  "#ffffff",
  "#ffffff",
  "#e0f2fe",
  "#bae6fd",
  "#fef08a",
  "#fed7aa",
  "#f472b6",
  "#c084fc",
];

interface MoonSpec {
  name: string;
  radius: number; // Orbit radius from planet center (px)
  periodSec: number; // Orbit period in seconds
  size: number; // Moon size (px)
  color: string;
  retrograde?: boolean;
}

interface PlanetSpec {
  name: string;
  orbitRadius: number; // Distance from Sun center (px)
  periodSec: number; // Revolution period around Sun (sec)
  size: number; // Planet diameter (px)
  background: string;
  boxShadow?: string;
  rings?: {
    type: "saturn" | "uranus";
    width: number;
    height: number;
    border: string;
  };
  moons?: MoonSpec[];
  label: string;
}

const PLANETS: PlanetSpec[] = [
  {
    name: "mercury",
    label: "Mercury",
    orbitRadius: 65,
    periodSec: 28,
    size: 8,
    background: "radial-gradient(circle at 35% 35%, #d4d4d4, #737373, #404040)",
    boxShadow: "0 0 6px rgba(212, 212, 212, 0.4)",
  },
  {
    name: "venus",
    label: "Venus",
    orbitRadius: 105,
    periodSec: 44,
    size: 12,
    background: "radial-gradient(circle at 35% 35%, #fef08a, #f59e0b, #b45309)",
    boxShadow: "0 0 10px rgba(245, 158, 11, 0.5)",
  },
  {
    name: "earth",
    label: "Earth",
    orbitRadius: 155,
    periodSec: 64,
    size: 14,
    background: "radial-gradient(circle at 35% 35%, #60a5fa, #0284c7, #15803d, #0f172a)",
    boxShadow: "0 0 12px rgba(56, 189, 248, 0.6)",
    moons: [
      { name: "luna", radius: 17, periodSec: 9.0, size: 4, color: "#e2e8f0" },
    ],
  },
  {
    name: "mars",
    label: "Mars",
    orbitRadius: 205,
    periodSec: 88,
    size: 10,
    background: "radial-gradient(circle at 35% 35%, #fca5a5, #ef4444, #991b1b)",
    boxShadow: "0 0 8px rgba(239, 68, 68, 0.5)",
    moons: [
      { name: "phobos", radius: 13, periodSec: 6.0, size: 3, color: "#cbd5e1" },
      { name: "deimos", radius: 19, periodSec: 11.0, size: 2.5, color: "#94a3b8" },
    ],
  },
  {
    name: "jupiter",
    label: "Jupiter",
    orbitRadius: 270,
    periodSec: 130,
    size: 26,
    background: "radial-gradient(circle at 35% 35%, #fef08a, #f97316, #ea580c, #7c2d12)",
    boxShadow: "0 0 18px rgba(249, 115, 22, 0.6)",
    moons: [
      { name: "io", radius: 23, periodSec: 6.4, size: 3, color: "#fef08a" },
      { name: "europa", radius: 29, periodSec: 9.6, size: 3, color: "#e0f2fe" },
      { name: "ganymede", radius: 37, periodSec: 15.0, size: 4.5, color: "#cbd5e1" },
      { name: "callisto", radius: 45, periodSec: 21.0, size: 3.8, color: "#64748b" },
    ],
  },
  {
    name: "saturn",
    label: "Saturn",
    orbitRadius: 345,
    periodSec: 180,
    size: 22,
    background: "radial-gradient(circle at 35% 35%, #fef08a, #fbbf24, #d97706)",
    boxShadow: "0 0 14px rgba(251, 191, 36, 0.5)",
    rings: {
      type: "saturn",
      width: 48,
      height: 16,
      border: "3px double rgba(251, 191, 36, 0.75)",
    },
    moons: [
      { name: "mimas", radius: 30, periodSec: 8.0, size: 2.8, color: "#cbd5e1" },
      { name: "enceladus", radius: 37, periodSec: 12.4, size: 3.2, color: "#ffffff" },
      { name: "titan", radius: 46, periodSec: 19.0, size: 4.8, color: "#f97316" },
    ],
  },
  {
    name: "uranus",
    label: "Uranus",
    orbitRadius: 420,
    periodSec: 250,
    size: 17,
    background: "radial-gradient(circle at 35% 35%, #a5f3fc, #06b6d4, #0e7490)",
    boxShadow: "0 0 12px rgba(34, 211, 238, 0.55)",
    rings: {
      type: "uranus",
      width: 12,
      height: 32,
      border: "1.5px solid rgba(165, 243, 252, 0.6)",
    },
    moons: [
      { name: "titania", radius: 22, periodSec: 11.0, size: 3.2, color: "#e2e8f0" },
      { name: "oberon", radius: 28, periodSec: 17.0, size: 3.0, color: "#94a3b8" },
    ],
  },
  {
    name: "neptune",
    label: "Neptune",
    orbitRadius: 490,
    periodSec: 320,
    size: 16,
    background: "radial-gradient(circle at 35% 35%, #93c5fd, #2563eb, #1e3a8a)",
    boxShadow: "0 0 12px rgba(59, 130, 246, 0.6)",
    moons: [
      { name: "triton", radius: 24, periodSec: 13.0, size: 3.6, color: "#c084fc", retrograde: true },
    ],
  },
  {
    name: "pluto",
    label: "Pluto",
    orbitRadius: 555,
    periodSec: 400,
    size: 7,
    background: "radial-gradient(circle at 35% 35%, #fde68a, #d97706, #78350f)",
    boxShadow: "0 0 6px rgba(217, 119, 6, 0.4)",
    moons: [
      { name: "charon", radius: 14, periodSec: 10.0, size: 3.0, color: "#94a3b8" },
    ],
  },
];

export default function SolarSystemAtmosphere() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1,000 Starfield Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Initialize exactly 1,000 twinkling stars (reduced size by 60%)
    const stars: Star[] = Array.from({ length: 1000 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: (Math.random() * 1.8 + 0.4) * 0.4,
      baseAlpha: Math.random() * 0.7 + 0.25,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      twinklePhase: Math.random() * Math.PI * 2,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Deep space radial glow gradient
      const bgGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        20,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.7,
      );
      bgGrad.addColorStop(0, "rgba(13, 19, 34, 0.4)");
      bgGrad.addColorStop(0.6, "rgba(7, 10, 18, 0.8)");
      bgGrad.addColorStop(1, "rgba(5, 7, 14, 0.98)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Draw all 1,000 stars
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.twinklePhase += star.twinkleSpeed;
        const currentAlpha = Math.max(
          0.1,
          Math.min(1.0, star.baseAlpha + Math.sin(star.twinklePhase) * 0.35),
        );

        ctx.save();
        ctx.globalAlpha = currentAlpha;
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        // Subtle soft glow around larger stars
        if (star.size > 0.56) {
          ctx.shadowBlur = 3;
          ctx.shadowColor = star.color;
          ctx.fill();
        }
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div className="solar-system-atmosphere" aria-hidden="true">
      {/* 1,000 Twinkling Starfield Canvas */}
      <canvas ref={canvasRef} className="solar-system-canvas" />

      {/* Sun in the Center */}
      <div className="sun-core-container" title="Sol (The Sun)" />

      {/* 9 Planets with Orbits & Moons */}
      {PLANETS.map((planet) => {
        const diameter = planet.orbitRadius * 2;
        return (
          <React.Fragment key={planet.name}>
            {/* Concentric Orbit Track Line */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: `${diameter}px`,
                height: `${diameter}px`,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                border: "1px dashed rgba(255, 255, 255, 0.08)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />

            {/* Revolving Orbital Arm */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: `${diameter}px`,
                height: `${diameter}px`,
                marginLeft: `-${planet.orbitRadius}px`,
                marginTop: `-${planet.orbitRadius}px`,
                borderRadius: "50%",
                animation: `orbit-spin-${planet.name} ${planet.periodSec}s linear infinite`,
                pointerEvents: "none",
                zIndex: 2,
              }}
            >
              {/* Keyframe animation for planet revolution */}
              <style>{`
                @keyframes orbit-spin-${planet.name} {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}</style>

              {/* Planet Container (positioned at 12 o'clock top of orbit) */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "0%",
                  transform: "translate(-50%, -50%)",
                  width: `${planet.size}px`,
                  height: `${planet.size}px`,
                  borderRadius: "50%",
                  background: planet.background,
                  boxShadow: planet.boxShadow,
                  zIndex: 3,
                }}
                title={planet.label}
              >
                {/* Saturn or Uranus Rings */}
                {planet.rings && planet.rings.type === "saturn" && (
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: `${planet.rings.width}px`,
                      height: `${planet.rings.height}px`,
                      transform: "translate(-50%, -50%) rotate(25deg)",
                      borderRadius: "50%",
                      border: planet.rings.border,
                      boxShadow: "0 0 8px rgba(251, 191, 36, 0.3)",
                      pointerEvents: "none",
                    }}
                  />
                )}
                {planet.rings && planet.rings.type === "uranus" && (
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: `${planet.rings.width}px`,
                      height: `${planet.rings.height}px`,
                      transform: "translate(-50%, -50%) rotate(70deg)",
                      borderRadius: "50%",
                      border: planet.rings.border,
                      boxShadow: "0 0 6px rgba(34, 211, 238, 0.4)",
                      pointerEvents: "none",
                    }}
                  />
                )}

                {/* Sub-orbiting Moons */}
                {planet.moons &&
                  planet.moons.map((moon) => {
                    const moonDiameter = moon.radius * 2;
                    const isRetro = moon.retrograde;
                    return (
                      <React.Fragment key={moon.name}>
                        {/* Moon Orbit Arm */}
                        <div
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            width: `${moonDiameter}px`,
                            height: `${moonDiameter}px`,
                            marginLeft: `-${moon.radius}px`,
                            marginTop: `-${moon.radius}px`,
                            borderRadius: "50%",
                            animation: `moon-spin-${planet.name}-${moon.name} ${moon.periodSec}s linear infinite ${
                              isRetro ? "reverse" : "normal"
                            }`,
                            pointerEvents: "none",
                          }}
                        >
                          <style>{`
                            @keyframes moon-spin-${planet.name}-${moon.name} {
                              from { transform: rotate(0deg); }
                              to { transform: rotate(360deg); }
                            }
                          `}</style>
                          {/* Moon Sphere */}
                          <div
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: "0%",
                              transform: "translate(-50%, -50%)",
                              width: `${moon.size}px`,
                              height: `${moon.size}px`,
                              borderRadius: "50%",
                              backgroundColor: moon.color,
                              boxShadow: `0 0 4px ${moon.color}`,
                            }}
                            title={`${planet.label}'s Moon: ${moon.name}`}
                          />
                        </div>
                      </React.Fragment>
                    );
                  })}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
