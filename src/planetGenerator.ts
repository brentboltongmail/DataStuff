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
  moveX: string;
  moveY: string;
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

  // Generate 1 focal planet floating slowly on a straight 360-degree linear path (starting off-screen and gliding on-screen)
  const count = 1;

  const archetypes = [
    "gas-giant",
    "oceanic-super-earth",
    "ice-world",
    "lava-planet",
    "purple-giant",
    "emerald-world",
    "solar-supergiant",
    "dark-void",
    "crystal-nebula",
    "inferno-lava-world",
    "bioluminescent-ocean",
  ];

  // Fisher-Yates shuffle archetypes using seeded rand
  for (let i = archetypes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [archetypes[i], archetypes[j]] = [archetypes[j], archetypes[i]];
  }

  const planets: RandomPlanet[] = [];

  for (let i = 0; i < count; i++) {
    const archetype = archetypes[i % archetypes.length];
    const name = `${randChoice(PLANET_NAMES_PREFIX)} ${randChoice(PLANET_NAMES_SUFFIX)}`;

    // Majestic focal size from 500px to 780px
    const size = randInt(500, 780);

    // Straight 360-degree linear travel vector matching ship movement
    const angleRad = randRange(0, Math.PI * 2);
    
    // Start 100% COMPLETELY OFF-SCREEN:
    // Radius R = 92vw/vh ensures start position is fully outside visible viewport
    const R = 92;
    const startXvw = parseFloat((50 - R * Math.cos(angleRad)).toFixed(1));
    const startYvh = parseFloat((50 - R * Math.sin(angleRad)).toFixed(1));
    
    // Vector carries planet completely across viewport to opposite side
    const deltaXvw = parseFloat((2 * R * Math.cos(angleRad)).toFixed(1));
    const deltaYvh = parseFloat((2 * R * Math.sin(angleRad)).toFixed(1));

    const xPct = startXvw;
    const yPct = startYvh;
    const moveX = `${deltaXvw}vw`;
    const moveY = `${deltaYvh}vh`;
    const moveRot = randInt(-25, 25);

    const startScale = parseFloat(randRange(0.9, 0.98).toFixed(2));
    const endScale = parseFloat(randRange(1.02, 1.1).toFixed(2));

    // Slow, stately astronomical space movement duration (240s to 500s = ~4 to 8.3 minutes to cross space)
    const duration = randInt(240, 500);

    // Delay = 0 so planet starts OFF-SCREEN and glides smoothly ON-SCREEN into view!
    const delay = 0;

    // Dynamic light origin position for 3D body radial gradient
    const lx = randInt(20, 75);
    const ly = randInt(20, 75);

    let bodyGradient = "";
    let bodyShadow = "";
    let haloBackground = "";
    let haloBlur = randInt(14, 30);
    let textureClass: string | undefined;
    let textureStyle: React.CSSProperties | undefined;
    let cloudStyle: React.CSSProperties | undefined;
    let auroraStyle: React.CSSProperties | undefined;
    let spotStyle: React.CSSProperties | undefined;

    switch (archetype) {
      case "oceanic-super-earth": {
        bodyGradient = `radial-gradient(circle at ${lx}% ${ly}%, #38bdf8 0%, #0284c7 28%, #0f172a 75%, #020617 100%)`;
        bodyShadow = `inset -45px -45px 75px rgba(2, 6, 23, 0.95), 0 0 ${randInt(100, 160)}px #38bdf8`;
        haloBackground = `radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.6) 0%, rgba(14, 165, 233, 0.35) 45%, transparent 70%)`;
        cloudStyle = { opacity: randRange(0.65, 0.92) };
        auroraStyle = { opacity: randRange(0.7, 0.98) };
        textureClass = "cloud-bands";
        break;
      }
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
      case "lava-planet":
      case "inferno-lava-world": {
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
      case "emerald-world":
      case "bioluminescent-ocean": {
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
      case "crystal-nebula":
      default: {
        const h = randInt(305, 345);
        bodyGradient = `radial-gradient(circle at ${lx}% ${ly}%, #fce7f3 0%, hsl(${h}, 95%, 78%) 35%, #be185d 72%, #4c0519 100%)`;
        bodyShadow = `inset -35px -35px 60px rgba(76, 5, 25, 0.95), 0 0 ${randInt(85, 135)}px hsl(${h}, 90%, 72%)`;
        haloBackground = `radial-gradient(circle at 50% 50%, rgba(244, 114, 182, 0.55) 0%, rgba(225, 29, 72, 0.3) 45%, transparent 70%)`;
        textureClass = "storm-swirls";
        break;
      }
    }

    // Generate Ring Systems (~98% chance with 4 to 8 wide, detailed rings)
    const rings: PlanetRing[] = [];
    const hasRings = rand() < 0.98;

    if (hasRings) {
      const ringCount = randInt(4, 8);
      const tiltX = randInt(55, 82);
      const tiltY = randInt(-32, 32);
      const tiltZ = randInt(0, 360);

      for (let r = 0; r < ringCount; r++) {
        const ringScale = 1.38 + r * 0.28;
        const sizePx = Math.round(size * ringScale);
        let borderStyle = "";
        let boxShadow = "";
        let spinDuration: number | undefined;

        if (r === 0) {
          borderStyle = "56px solid rgba(186, 230, 253, 0.75)";
          boxShadow = "0 0 65px rgba(56, 189, 248, 0.75)";
        } else if (r === 1) {
          borderStyle = "44px dashed rgba(253, 224, 71, 0.7)";
          boxShadow = "0 0 50px rgba(234, 179, 8, 0.65)";
          spinDuration = randInt(50, 110);
        } else if (r === 2) {
          borderStyle = "20px solid rgba(3, 7, 18, 0.9)";
          boxShadow = "none";
        } else if (r === 3) {
          borderStyle = "48px solid rgba(192, 132, 252, 0.65)";
          boxShadow = "0 0 55px rgba(168, 85, 247, 0.7)";
        } else if (r === 4) {
          borderStyle = "36px solid rgba(52, 211, 153, 0.6)";
          boxShadow = "0 0 40px rgba(16, 185, 129, 0.55)";
        } else if (r === 5) {
          borderStyle = "16px solid rgba(255, 255, 255, 0.85)";
          boxShadow = "0 0 30px rgba(255, 255, 255, 0.85)";
        } else {
          borderStyle = "40px dashed rgba(244, 114, 182, 0.5)";
          boxShadow = "0 0 45px rgba(244, 114, 182, 0.55)";
          spinDuration = randInt(70, 150);
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

    // Generate Orbiting Moons (2 to 4 moons accompanying the planet)
    const moonCount = randInt(2, 4);
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

export interface RandomShip {
  id: string;
  type: string;
  startXvw: number;
  startYvh: number;
  deltaXvw: number;
  deltaYvh: number;
  rotationDeg: number;
  scale: number;
  duration: number;
  delay: number;
}

export function generateSeededShips(seed: number): RandomShip[] {
  const rand = createSeededRandom(seed + 9999);
  const randRange = (min: number, max: number) => min + rand() * (max - min);
  const randInt = (min: number, max: number) => Math.floor(randRange(min, max + 1));

  const shipTypes = ["dreadnought", "interceptor", "cruiser", "shuttle", "explorer"];
  const count = randInt(4, 6);
  const ships: RandomShip[] = [];

  for (let i = 0; i < count; i++) {
    const type = shipTypes[i % shipTypes.length];
    // Angle in radians (0 to 2pi - random 360 degree path directions)
    const angleRad = randRange(0, Math.PI * 2);
    const rotationDeg = parseFloat(((angleRad * 180) / Math.PI).toFixed(1));

    // Distance vector across viewport (160vw)
    const D = 160;
    const deltaXvw = parseFloat((D * Math.cos(angleRad)).toFixed(1));
    const deltaYvh = parseFloat((D * Math.sin(angleRad)).toFixed(1));

    // Start point randomly distributed on-screen (8vw to 82vw, 8vh to 82vh)
    const startXvw = parseFloat(randRange(8, 82).toFixed(1));
    const startYvh = parseFloat(randRange(8, 82).toFixed(1));

    // Scale reduced by 50% (0.3 to 0.42)
    const scale = parseFloat(randRange(0.3, 0.42).toFixed(2));

    // Slow stately cruise duration (45s to 90s)
    const duration = randInt(45, 90);
    // Negative delay so ships start ON-SCREEN at random points along their vectors
    const delay = -parseFloat((rand() * duration).toFixed(1));

    ships.push({
      id: `ship-${seed}-${i}`,
      type,
      startXvw,
      startYvh,
      deltaXvw,
      deltaYvh,
      rotationDeg,
      scale,
      duration,
      delay,
    });
  }

  return ships;
}
