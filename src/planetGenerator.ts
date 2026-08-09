export interface PlanetRing {
  sizePx: number;
  borderStyle: string;
  boxShadow: string;
  tiltX: number;
  tiltY: number;
  tiltZ: number;
  spinDuration?: number;
}

export interface PlanetMoon {
  size: number;
  gradient: string;
  glow: string;
  topPct: number;
  leftPct: number;
  orbitDuration: number;
  orbitDelay: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startScale: number;
  endScale: number;
}

export interface RandomPlanet {
  id: string;
  name: string;
  type: string;
  size: number;
  xPct: number;
  yPct: number;
  moveX: number;
  moveY: number;
  moveRot: number;
  startScale: number;
  endScale: number;
  duration: number;
  delay: number;
  bodyGradient: string;
  bodyShadow: string;
  haloBackground: string;
  haloBlur: number;
  textureClass?: string;
  textureStyle?: React.CSSProperties;
  cloudStyle?: React.CSSProperties;
  auroraStyle?: React.CSSProperties;
  spotStyle?: React.CSSProperties;
  rings: PlanetRing[];
  moons: PlanetMoon[];
}

export function createSeededRandom(seed: number) {
  let s = seed >>> 0;
  return function rand(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLANET_NAMES_PREFIX = [
  "Aethel", "Zephyr", "Pyros", "Cryo", "Obsidian", "Vortex", "Krypton", "Chronos",
  "Hyperion", "Solaria", "Astral", "Neptune", "Ignis", "Nebula", "Titan", "Zenith",
  "Aura", "Celeste", "Elysium", "Thalassa", "Vesper", "Orion", "Borealis", "Starlight",
  "Phaeton", "Triton", "Solaris", "Valaria", "Cygnus", "Vandenberg", "Kepler", "Gliese"
];

const PLANET_NAMES_SUFFIX = [
  "Prime", "Delta", "Station VII", "IV", "Major", "IX", "B", "Proxima",
  "Echo", "Sector 7", "Alpha", "Zero", "Nova", "Oasis", "Realm", "Core",
  "Centauri", "Epsilon", "Gamma", "Omega", "Suprema", "Polaris", "Outpost 9"
];

export function generateSeededPlanets(seed: number): RandomPlanet[] {
  const rand = createSeededRandom(seed);

  const randRange = (min: number, max: number) => min + rand() * (max - min);
  const randInt = (min: number, max: number) => Math.floor(randRange(min, max + 1));
  const randChoice = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  // Generate 4 to 6 planets with wild placement variety
  const count = randInt(4, 6);

  // Poisson-Disc / Candidate-based free viewport placement (x: 2% to 88%, y: 2% to 82%)
  const positions: { x: number; y: number }[] = [];
  const minDistPct = 22; // Minimum distance between planet centers in % coordinates

  for (let i = 0; i < count; i++) {
    let candidateX = 0;
    let candidateY = 0;
    let valid = false;

    for (let attempt = 0; attempt < 80; attempt++) {
      candidateX = randRange(2, 88);
      candidateY = randRange(2, 82);

      let tooClose = false;
      for (const pos of positions) {
        const dx = candidateX - pos.x;
        const dy = candidateY - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistPct) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      candidateX = randRange(2, 88);
      candidateY = randRange(2, 82);
    }

    positions.push({ x: candidateX, y: candidateY });
  }

  const archetypes = [
    "gas-giant",
    "ice-world",
    "lava-planet",
    "purple-giant",
    "emerald-world",
    "solar-supergiant",
    "dark-void",
    "crystal-nebula",
  ];

  // Fisher-Yates shuffle archetypes using seeded rand
  for (let i = archetypes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [archetypes[i], archetypes[j]] = [archetypes[j], archetypes[i]];
  }

  const planets: RandomPlanet[] = [];

  for (let i = 0; i < count; i++) {
    const pos = positions[i];
    const xPct = parseFloat(pos.x.toFixed(1));
    const yPct = parseFloat(pos.y.toFixed(1));

    const archetype = archetypes[i % archetypes.length];
    const name = `${randChoice(PLANET_NAMES_PREFIX)} ${randChoice(PLANET_NAMES_SUFFIX)}`;
    
    // Vary size significantly from 130px to 460px
    const size = randInt(130, 460);

    // Wild, unconstrained movement vectors in random directions!
    const angleRad = randRange(0, Math.PI * 2);
    const speedDist = randRange(150, 450);
    const moveX = Math.round(Math.cos(angleRad) * speedDist);
    const moveY = Math.round(Math.sin(angleRad) * speedDist);
    const moveRot = randInt(-25, 25);

    const startScale = parseFloat(randRange(0.85, 0.98).toFixed(2));
    const endScale = parseFloat(randRange(1.02, 1.15).toFixed(2));
    const duration = randInt(22, 85);
    const delay = -parseFloat((rand() * duration).toFixed(1));

    // Dynamic light origin position for body radial gradient
    const lx = randInt(20, 75);
    const ly = randInt(20, 75);

    let bodyGradient = "";
    let bodyShadow = "";
    let haloBackground = "";
    let haloBlur = randInt(10, 26);
    let textureClass: string | undefined;
    let textureStyle: React.CSSProperties | undefined;
    let cloudStyle: React.CSSProperties | undefined;
    let auroraStyle: React.CSSProperties | undefined;
    let spotStyle: React.CSSProperties | undefined;

    switch (archetype) {
      case "gas-giant": {
        const h1 = randInt(170, 225);
        const h2 = randInt(195, 250);
        bodyGradient = `radial-gradient(circle at ${lx}% ${ly}%, hsl(${h1}, 95%, 60%) 0%, hsl(${h2}, 85%, 45%) 45%, #0f172a 85%, #020617 100%)`;
        bodyShadow = `inset -45px -45px 75px rgba(2, 6, 23, 0.9), 0 0 ${randInt(90, 150)}px hsl(${h1}, 85%, 50%)`;
        haloBackground = `radial-gradient(circle at 50% 50%, hsl(${h1}, 90%, 60%, 0.5) 0%, hsl(${h2}, 85%, 50%, 0.28) 45%, transparent 70%)`;
        cloudStyle = { opacity: randRange(0.4, 0.85) };
        auroraStyle = { opacity: randRange(0.5, 0.95) };
        spotStyle = { opacity: randRange(0.6, 0.95) };
        break;
      }
      case "ice-world": {
        const h = randInt(175, 215);
        bodyGradient = `radial-gradient(circle at ${lx}% ${ly}%, #ffffff 0%, hsl(${h}, 95%, 85%) 30%, hsl(${h}, 85%, 58%) 65%, #0f172a 100%)`;
        bodyShadow = `inset -30px -30px 50px rgba(15, 23, 42, 0.95), 0 0 ${randInt(75, 120)}px hsl(${h}, 90%, 75%)`;
        haloBackground = `radial-gradient(circle at 50% 50%, rgba(224, 242, 254, 0.55) 0%, rgba(56, 189, 248, 0.3) 50%, transparent 70%)`;
        textureClass = "ice-crust";
        break;
      }
      case "lava-planet": {
        const h = randInt(5, 38);
        bodyGradient = `radial-gradient(circle at ${lx}% ${ly}%, hsl(${h}, 98%, 62%) 0%, #dc2626 40%, #7f1d1d 75%, #0f172a 100%)`;
        bodyShadow = `inset -35px -35px 60px rgba(15, 23, 42, 0.95), 0 0 ${randInt(80, 130)}px hsl(${h}, 95%, 52%)`;
        haloBackground = `radial-gradient(circle at 50% 50%, rgba(249, 115, 22, 0.55) 0%, rgba(220, 38, 38, 0.35) 45%, transparent 70%)`;
        textureClass = "lava-rivers";
        break;
      }
      case "purple-giant": {
        const h = randInt(255, 298);
        bodyGradient = `radial-gradient(circle at ${lx}% ${ly}%, hsl(${h}, 95%, 75%) 0%, hsl(${h}, 85%, 58%) 35%, #6b21a8 70%, #0f172a 100%)`;
        bodyShadow = `inset -40px -40px 70px rgba(15, 23, 42, 0.95), 0 0 ${randInt(85, 140)}px hsl(${h}, 85%, 68%)`;
        haloBackground = `radial-gradient(circle at 50% 50%, hsl(${h}, 90%, 72%, 0.55) 0%, rgba(168, 85, 247, 0.35) 45%, transparent 70%)`;
        textureClass = "storm-swirls";
        break;
      }
      case "emerald-world": {
        const h = randInt(130, 168);
        bodyGradient = `radial-gradient(circle at ${lx}% ${ly}%, #a7f3d0 0%, hsl(${h}, 90%, 50%) 38%, #064e3b 75%, #022c22 100%)`;
        bodyShadow = `inset -35px -35px 60px rgba(2, 44, 34, 0.95), 0 0 ${randInt(75, 125)}px hsl(${h}, 85%, 48%)`;
        haloBackground = `radial-gradient(circle at 50% 50%, rgba(52, 211, 153, 0.55) 0%, rgba(5, 150, 105, 0.3) 45%, transparent 70%)`;
        textureClass = "cloud-bands";
        break;
      }
      case "solar-supergiant": {
        const h = randInt(38, 55);
        bodyGradient = `radial-gradient(circle at ${lx}% ${ly}%, #fef08a 0%, hsl(${h}, 98%, 56%) 40%, #b45309 75%, #451a03 100%)`;
        bodyShadow = `inset -40px -40px 65px rgba(69, 26, 3, 0.95), 0 0 ${randInt(110, 160)}px #fde047`;
        haloBackground = `radial-gradient(circle at 50% 50%, rgba(254, 240, 138, 0.65) 0%, rgba(234, 179, 8, 0.4) 50%, transparent 70%)`;
        textureClass = "storm-swirls";
        break;
      }
      case "dark-void": {
        const h = randInt(190, 270);
        bodyGradient = `radial-gradient(circle at ${lx}% ${ly}%, hsl(${h}, 95%, 65%) 0%, #1e1b4b 35%, #090d16 75%, #000000 100%)`;
        bodyShadow = `inset -45px -45px 70px rgba(0, 0, 0, 0.98), 0 0 ${randInt(90, 145)}px hsl(${h}, 90%, 65%)`;
        haloBackground = `radial-gradient(circle at 50% 50%, hsl(${h}, 90%, 60%, 0.55) 0%, rgba(99, 102, 241, 0.35) 45%, transparent 70%)`;
        textureClass = "ice-crust";
        break;
      }
      case "crystal-nebula": {
        const h = randInt(305, 345);
        bodyGradient = `radial-gradient(circle at ${lx}% ${ly}%, #fce7f3 0%, hsl(${h}, 95%, 78%) 35%, #be185d 72%, #4c0519 100%)`;
        bodyShadow = `inset -35px -35px 60px rgba(76, 5, 25, 0.95), 0 0 ${randInt(85, 135)}px hsl(${h}, 90%, 72%)`;
        haloBackground = `radial-gradient(circle at 50% 50%, rgba(244, 114, 182, 0.55) 0%, rgba(225, 29, 72, 0.3) 45%, transparent 70%)`;
        textureClass = "storm-swirls";
        break;
      }
    }

    // Generate Ring Systems (~70% chance)
    const rings: PlanetRing[] = [];
    const hasRings = rand() < 0.72;

    if (hasRings) {
      const ringCount = randInt(1, 3);
      const tiltX = randInt(55, 85);
      const tiltY = randInt(-35, 35);
      const tiltZ = randInt(0, 360);

      for (let r = 0; r < ringCount; r++) {
        const ringScale = 1.32 + r * 0.26;
        const sizePx = Math.round(size * ringScale);
        let borderStyle = "";
        let boxShadow = "";
        let spinDuration: number | undefined;

        if (r === 0) {
          if (archetype === "lava-planet") {
            borderStyle = "16px dashed rgba(249, 115, 22, 0.65)";
            boxShadow = "0 0 35px rgba(239, 68, 68, 0.6)";
            spinDuration = randInt(50, 95);
          } else if (archetype === "purple-giant" || archetype === "dark-void") {
            borderStyle = "18px solid rgba(192, 132, 252, 0.6)";
            boxShadow = "0 0 45px rgba(168, 85, 247, 0.65)";
          } else if (archetype === "emerald-world") {
            borderStyle = "14px solid rgba(52, 211, 153, 0.6)";
            boxShadow = "0 0 35px rgba(16, 185, 129, 0.55)";
          } else if (archetype === "solar-supergiant") {
            borderStyle = "16px solid rgba(253, 224, 71, 0.65)";
            boxShadow = "0 0 42px rgba(234, 179, 8, 0.65)";
          } else {
            borderStyle = "14px solid rgba(186, 230, 253, 0.55)";
            boxShadow = "0 0 35px rgba(56, 189, 248, 0.45)";
          }
        } else if (r === 1) {
          borderStyle = "20px solid rgba(253, 224, 71, 0.4)";
          boxShadow = "0 0 22px rgba(234, 179, 8, 0.35)";
        } else {
          borderStyle = "6px solid rgba(3, 7, 18, 0.85)";
          boxShadow = "none";
        }

        rings.push({
          sizePx,
          borderStyle,
          boxShadow,
          tiltX,
          tiltY,
          tiltZ,
          spinDuration,
        });
      }
    }

    // Generate Orbiting Moons (0 to 3 moons)
    const moonCount = randInt(0, 3);
    const moons: PlanetMoon[] = [];

    const moonPalettes = [
      { bg: "radial-gradient(circle at 35% 35%, #e0f2fe 0%, #38bdf8 60%, #0f172a 100%)", glow: "0 0 16px rgba(56, 189, 248, 0.6)" },
      { bg: "radial-gradient(circle at 30% 30%, #fef08a 0%, #eab308 60%, #451a03 100%)", glow: "0 0 12px rgba(234, 179, 8, 0.5)" },
      { bg: "radial-gradient(circle at 35% 35%, #ffffff 0%, #cbd5e1 55%, #1e293b 100%)", glow: "0 0 14px rgba(255, 255, 255, 0.7)" },
      { bg: "radial-gradient(circle at 35% 35%, #fdba74 0%, #f97316 60%, #450a0a 100%)", glow: "0 0 16px rgba(249, 115, 22, 0.7)" },
      { bg: "radial-gradient(circle at 35% 35%, #f472b6 0%, #c084fc 60%, #3b0764 100%)", glow: "0 0 20px rgba(192, 132, 252, 0.8)" },
      { bg: "radial-gradient(circle at 35% 35%, #6ee7b7 0%, #059669 60%, #022c22 100%)", glow: "0 0 16px rgba(52, 211, 153, 0.7)" },
    ];

    for (let m = 0; m < moonCount; m++) {
      const moonSize = randInt(20, 46);
      const pal = randChoice(moonPalettes);
      const startX = randInt(-220, -70);
      const startY = randInt(-70, 50);
      const endX = randInt(130, 260);
      const endY = randInt(40, 100);
      const orbitDuration = randInt(18, 44);
      const orbitDelay = -parseFloat((rand() * orbitDuration).toFixed(1));

      moons.push({
        size: moonSize,
        gradient: pal.bg,
        glow: pal.glow,
        topPct: randInt(8, 82),
        leftPct: randInt(8, 82),
        orbitDuration,
        orbitDelay,
        startX,
        startY,
        endX,
        endY,
        startScale: parseFloat(randRange(0.72, 0.85).toFixed(2)),
        endScale: parseFloat(randRange(1.12, 1.25).toFixed(2)),
      });
    }

    planets.push({
      id: `planet-${seed}-${i}`,
      name,
      type: archetype,
      size,
      xPct,
      yPct,
      moveX,
      moveY,
      moveRot,
      startScale,
      endScale,
      duration,
      delay,
      bodyGradient,
      bodyShadow,
      haloBackground,
      haloBlur,
      textureClass,
      textureStyle,
      cloudStyle,
      auroraStyle,
      spotStyle,
      rings,
      moons,
    });
  }

  return planets;
}
