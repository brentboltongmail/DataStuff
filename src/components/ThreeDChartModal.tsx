import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { QueryResult } from "../types";

export type ChartType3D = "bar" | "scatter" | "surface" | "donut";

export type ColorTheme3D = "neon" | "metallic" | "corporate" | "sunset" | "synthwave";

interface Props {
  result: QueryResult;
  onClose: () => void;
}

interface ColumnOption {
  name: string;
  isNumeric: boolean;
  index: number;
}

interface TooltipData {
  x: number;
  y: number;
  label: string;
  valueName: string;
  value: string | number;
  extraInfo?: string;
}

const PALETTES: Record<ColorTheme3D, number[]> = {
  neon: [0x00f3ff, 0xff007f, 0x00ff66, 0xffaa00, 0x9d00ff, 0x00aaff],
  metallic: [0xd4af37, 0xc0c0c0, 0xb87333, 0x4682b4, 0xe5e4e2, 0xcd7f32],
  corporate: [0x0055ff, 0x00bfff, 0x20b2aa, 0x5f9ea0, 0x4169e1, 0x008080],
  sunset: [0xff4500, 0xff8c00, 0xffd700, 0xc71585, 0x8a2be2, 0xff1493],
  synthwave: [0xff00ff, 0x7b68ee, 0x00ffff, 0xff1493, 0xffff00, 0x9400d3],
};

const BACKGROUNDS: Record<ColorTheme3D, number> = {
  neon: 0x0a0c16,
  metallic: 0x121418,
  corporate: 0x0f172a,
  sunset: 0x180b1e,
  synthwave: 0x0f051d,
};

const GRID_COLORS: Record<ColorTheme3D, [number, number]> = {
  neon: [0x00f3ff, 0x1f293d],
  metallic: [0xd4af37, 0x2a2e37],
  corporate: [0x0055ff, 0x1e293b],
  sunset: [0xff4500, 0x3b1c32],
  synthwave: [0xff00ff, 0x2a0d45],
};

function parseNumeric(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return Number.isNaN(val) ? null : val;
  const parsed = Number.parseFloat(String(val).replace(/,/g, ""));
  return Number.isNaN(parsed) ? null : parsed;
}

export const ThreeDChartModal: React.FC<Props> = ({ result, onClose }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const interactiveObjectsRef = useRef<THREE.Object3D[]>([]);

  // Chart configuration state
  const [chartType, setChartType] = useState<ChartType3D>("bar");
  const [theme, setTheme] = useState<ColorTheme3D>("neon");
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Column Options
  const columns: ColumnOption[] = useMemo(() => {
    return result.columns.map((col, idx) => {
      let numericCount = 0;
      let checkedCount = 0;
      const sampleLimit = Math.min(result.rows.length, 50);
      for (let i = 0; i < sampleLimit; i++) {
        const val = result.rows[i]?.[idx];
        if (val !== null && val !== undefined && val !== "") {
          checkedCount++;
          if (parseNumeric(val) !== null) numericCount++;
        }
      }
      const isNumeric = checkedCount > 0 && numericCount / checkedCount > 0.6;
      return { name: col.name, isNumeric, index: idx };
    });
  }, [result]);

  // Initial column selection heuristics
  const defaultLabelCol = useMemo(() => {
    const stringCol = columns.find((c) => !c.isNumeric);
    return stringCol ? stringCol.index : 0;
  }, [columns]);

  const defaultValueCol = useMemo(() => {
    const numCol = columns.find((c) => c.isNumeric);
    return numCol ? numCol.index : columns.length > 1 ? 1 : 0;
  }, [columns]);

  const defaultZCol = useMemo(() => {
    const secondaryStrCol = columns.find((c) => !c.isNumeric && c.index !== defaultLabelCol);
    if (secondaryStrCol) return secondaryStrCol.index;
    const secondaryNumCol = columns.find((c) => c.isNumeric && c.index !== defaultValueCol);
    return secondaryNumCol ? secondaryNumCol.index : -1;
  }, [columns, defaultLabelCol, defaultValueCol]);

  const [labelColIdx, setLabelColIdx] = useState<number>(defaultLabelCol);
  const [valueColIdx, setValueColIdx] = useState<number>(defaultValueCol);
  const [zColIdx, setZColIdx] = useState<number>(defaultZCol);

  // Tooltip state
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Setup Three.js Scene Lifecycle
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUNDS[theme]);
    scene.fog = new THREE.FogExp2(BACKGROUNDS[theme], 0.008);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(25, 25, 35);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Clear previous canvas
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Prevent camera below ground
    controls.minDistance = 5;
    controls.maxDistance = 250;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(30, 50, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 200;
    const shadowDist = 40;
    dirLight.shadow.camera.left = -shadowDist;
    dirLight.shadow.camera.right = shadowDist;
    dirLight.shadow.camera.top = shadowDist;
    dirLight.shadow.camera.bottom = -shadowDist;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(PALETTES[theme][0], 2, 80);
    pointLight.position.set(0, 20, 0);
    scene.add(pointLight);

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      renderer.dispose();
    };
  }, [theme]);

  // Update Background & Fog on Theme change
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(BACKGROUNDS[theme]);
      sceneRef.current.fog = new THREE.FogExp2(BACKGROUNDS[theme], 0.008);
    }
  }, [theme]);

  // Re-build 3D Scene Geometry whenever parameters change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous dynamic chart objects & lights except Ambient & Directional
    interactiveObjectsRef.current = [];
    const toRemove: THREE.Object3D[] = [];
    scene.children.forEach((child) => {
      if (child.type === "Mesh" || child.type === "Group" || child.type === "GridHelper" || child.type === "PointLight") {
        toRemove.push(child);
      }
    });
    toRemove.forEach((obj) => scene.remove(obj));

    const palette = PALETTES[theme];
    const pointLight = new THREE.PointLight(palette[0], 2, 80);
    pointLight.position.set(0, 20, 0);
    scene.add(pointLight);

    const rows = result.rows;
    if (rows.length === 0) return;

    const labelColName = columns[labelColIdx]?.name || "Label";
    const valueColName = columns[valueColIdx]?.name || "Value";
    const zColName = zColIdx >= 0 ? columns[zColIdx]?.name : undefined;

    // Limit visible rows for performance & clean aesthetic
    const maxItems = chartType === "surface" ? Math.min(rows.length, 100) : Math.min(rows.length, 150);
    const slicedRows = rows.slice(0, maxItems);

    // Extract numerical values & metrics
    const numericValues = slicedRows.map((r) => parseNumeric(r[valueColIdx]) ?? 0);
    const maxVal = Math.max(...numericValues, 1);
    const minVal = Math.min(...numericValues, 0);
    const range = maxVal - minVal || 1;

    // Ground Plane & Grid
    if (showGrid && chartType !== "donut") {
      const gridSize = Math.max(30, Math.sqrt(maxItems) * 6);
      const gridColors = GRID_COLORS[theme];
      const grid = new THREE.GridHelper(gridSize, 30, gridColors[0], gridColors[1]);
      grid.position.y = -0.01;
      scene.add(grid);

      // Reflective / Shadow Receiving Ground Plane
      const groundGeo = new THREE.PlaneGeometry(gridSize * 1.5, gridSize * 1.5);
      const groundMat = new THREE.MeshStandardMaterial({
        color: BACKGROUNDS[theme],
        roughness: 0.8,
        metalness: 0.2,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.02;
      ground.receiveShadow = true;
      scene.add(ground);
    }

    // Interactive Group Container
    const chartGroup = new THREE.Group();
    scene.add(chartGroup);

    // --- 1. 3D BAR / COLUMN CHART ---
    if (chartType === "bar") {
      const zGroups = new Map<string, number>();
      if (zColIdx >= 0) {
        slicedRows.forEach((r) => {
          const key = String(r[zColIdx] ?? "Default");
          if (!zGroups.has(key)) zGroups.set(key, zGroups.size);
        });
      }

      const numZ = Math.max(1, zGroups.size);
      const numX = Math.ceil(slicedRows.length / numZ);
      const barWidth = 1.2;
      const barGap = 0.6;
      const maxHeight = 15;

      const startX = -((numX * (barWidth + barGap)) / 2);
      const startZ = -((numZ * (barWidth + barGap)) / 2);

      slicedRows.forEach((row, i) => {
        const val = parseNumeric(row[valueColIdx]) ?? 0;
        const normVal = Math.max(0.1, (val - Math.min(0, minVal)) / (range || 1));
        const height = normVal * maxHeight;
        const label = String(row[labelColIdx] ?? `Row ${i + 1}`);

        let xIdx = i;
        let zIdx = 0;
        let zGroupLabel = "";

        if (zColIdx >= 0) {
          zGroupLabel = String(row[zColIdx] ?? "Series");
          zIdx = zGroups.get(zGroupLabel) || 0;
          xIdx = Math.floor(i / numZ);
        }

        const posX = startX + xIdx * (barWidth + barGap);
        const posZ = startZ + zIdx * (barWidth + barGap);

        const geometry = new THREE.BoxGeometry(barWidth, height, barWidth);
        const colorHex = palette[i % palette.length];

        const material = new THREE.MeshStandardMaterial({
          color: colorHex,
          metalness: theme === "metallic" ? 0.8 : 0.3,
          roughness: theme === "neon" ? 0.1 : 0.3,
          emissive: theme === "neon" ? colorHex : 0x000000,
          emissiveIntensity: theme === "neon" ? 0.15 : 0,
        });

        const bar = new THREE.Mesh(geometry, material);
        bar.position.set(posX, height / 2, posZ);
        bar.castShadow = true;
        bar.receiveShadow = true;

        // Store metadata for hover tooltips
        bar.userData = {
          label,
          valueName: valueColName,
          value: val.toLocaleString(),
          extraInfo: zGroupLabel ? `${zColName}: ${zGroupLabel}` : undefined,
          colorHex,
        };

        chartGroup.add(bar);
        interactiveObjectsRef.current.push(bar);
      });

      // Adjust camera positioning based on bar bounding size
      if (controlsRef.current && cameraRef.current) {
        controlsRef.current.target.set(0, maxHeight / 3, 0);
        cameraRef.current.position.set(startX * 1.5, maxHeight * 1.5, startZ * 2.5);
      }
    }

    // --- 2. 3D SCATTER / BUBBLE PLOT ---
    else if (chartType === "scatter") {
      const spreadX = 25;
      const spreadY = 15;
      const spreadZ = 25;

      const zValues = zColIdx >= 0 ? slicedRows.map((r) => parseNumeric(r[zColIdx]) ?? 0) : [];
      const maxZ = Math.max(...zValues, 1);
      const minZ = Math.min(...zValues, 0);
      const rangeZ = maxZ - minZ || 1;

      slicedRows.forEach((row, i) => {
        const valY = parseNumeric(row[valueColIdx]) ?? 0;
        const normY = (valY - minVal) / range;

        const posX = (i / slicedRows.length - 0.5) * spreadX;
        const posY = normY * spreadY + 1;
        const posZ = zColIdx >= 0 ? (((zValues[i] ?? 0) - minZ) / rangeZ - 0.5) * spreadZ : (Math.sin(i) * spreadZ) / 2;

        const radius = 0.6 + normY * 0.8;
        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        const colorHex = palette[i % palette.length];

        const material = new THREE.MeshPhysicalMaterial({
          color: colorHex,
          metalness: theme === "metallic" ? 0.9 : 0.2,
          roughness: 0.1,
          transmission: theme === "neon" ? 0.2 : 0,
          clearcoat: 0.8,
          emissive: colorHex,
          emissiveIntensity: theme === "neon" ? 0.3 : 0.05,
        });

        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(posX, posY, posZ);
        sphere.castShadow = true;

        const label = String(row[labelColIdx] ?? `Point ${i + 1}`);
        sphere.userData = {
          label,
          valueName: valueColName,
          value: valY.toLocaleString(),
          extraInfo: zColIdx >= 0 ? `${zColName}: ${zValues[i]?.toLocaleString()}` : undefined,
          colorHex,
        };

        chartGroup.add(sphere);
        interactiveObjectsRef.current.push(sphere);

        // Ground reflection ring
        const ringGeo = new THREE.RingGeometry(0.1, radius * 0.8, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.25,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(posX, 0.01, posZ);
        chartGroup.add(ring);
      });

      if (controlsRef.current && cameraRef.current) {
        controlsRef.current.target.set(0, spreadY / 2, 0);
        cameraRef.current.position.set(spreadX * 0.8, spreadY * 1.2, spreadZ * 1.2);
      }
    }

    // --- 3. 3D SURFACE / MESH HEATMAP ---
    else if (chartType === "surface") {
      const gridSize = Math.min(20, Math.floor(Math.sqrt(slicedRows.length)));
      const colsCount = Math.max(2, gridSize);
      const rowsCount = Math.max(2, Math.ceil(slicedRows.length / colsCount));

      const planeWidth = 24;
      const planeHeight = 24;
      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, colsCount - 1, rowsCount - 1);
      geometry.rotateX(-Math.PI / 2);

      const count = geometry.attributes.position.count;
      const colors = new Float32Array(count * 3);
      const posAttr = geometry.attributes.position;

      const c1 = new THREE.Color(palette[0]);
      const c2 = new THREE.Color(palette[1 % palette.length]);
      const c3 = new THREE.Color(palette[2 % palette.length]);

      for (let i = 0; i < count; i++) {
        const rowIdx = Math.floor(i / colsCount);
        const colIdx = i % colsCount;
        const dataIdx = rowIdx * colsCount + colIdx;

        const rowData = slicedRows[dataIdx % slicedRows.length];
        const val = rowData ? (parseNumeric(rowData[valueColIdx]) ?? 0) : 0;
        const normVal = Math.max(0, (val - minVal) / range);

        const yElevation = normVal * 10;
        posAttr.setY(i, yElevation);

        // Elevation color gradient
        const vertexColor = new THREE.Color();
        if (normVal < 0.5) {
          vertexColor.copy(c1).lerp(c2, normVal * 2);
        } else {
          vertexColor.copy(c2).lerp(c3, (normVal - 0.5) * 2);
        }

        colors[i * 3] = vertexColor.r;
        colors[i * 3 + 1] = vertexColor.g;
        colors[i * 3 + 2] = vertexColor.b;
      }

      geometry.computeVertexNormals();
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        wireframe: false,
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.4,
      });

      const surfaceMesh = new THREE.Mesh(geometry, material);
      surfaceMesh.castShadow = true;
      surfaceMesh.receiveShadow = true;

      surfaceMesh.userData = {
        label: `3D Surface Grid (${colsCount}x${rowsCount})`,
        valueName: valueColName,
        value: `Peak: ${maxVal.toLocaleString()}`,
        extraInfo: `Min: ${minVal.toLocaleString()}`,
      };

      chartGroup.add(surfaceMesh);
      interactiveObjectsRef.current.push(surfaceMesh);

      // Subtle wireframe overlay for tech visual aesthetic
      const wireframeMat = new THREE.MeshBasicMaterial({
        color: palette[0],
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      });
      const wireframeMesh = new THREE.Mesh(geometry, wireframeMat);
      surfaceMesh.add(wireframeMesh);

      if (controlsRef.current && cameraRef.current) {
        controlsRef.current.target.set(0, 4, 0);
        cameraRef.current.position.set(20, 18, 25);
      }
    }

    // --- 4. 3D DONUT / PIE CHART ---
    else if (chartType === "donut") {
      const topItems = slicedRows.slice(0, 12);
      const totalSum = topItems.reduce((acc, r) => acc + Math.max(0, parseNumeric(r[valueColIdx]) ?? 0), 0) || 1;

      let startAngle = 0;
      const innerRadius = 3.5;
      const outerRadius = 8.5;
      const height = 2.5;

      topItems.forEach((row, i) => {
        const val = Math.max(0, parseNumeric(row[valueColIdx]) ?? 0);
        const fraction = val / totalSum;
        const angle = fraction * Math.PI * 2;

        if (angle < 0.01) return;

        const shape = new THREE.Shape();
        const endAngle = startAngle + angle;

        shape.absarc(0, 0, outerRadius, startAngle, endAngle, false);
        shape.absarc(0, 0, innerRadius, endAngle, startAngle, true);

        const extrudeSettings = {
          depth: height,
          bevelEnabled: true,
          bevelSegments: 3,
          steps: 1,
          bevelSize: 0.15,
          bevelThickness: 0.15,
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.rotateX(Math.PI / 2);

        const colorHex = palette[i % palette.length];
        const material = new THREE.MeshStandardMaterial({
          color: colorHex,
          metalness: theme === "metallic" ? 0.8 : 0.3,
          roughness: 0.2,
          emissive: theme === "neon" ? colorHex : 0x000000,
          emissiveIntensity: theme === "neon" ? 0.12 : 0,
        });

        const slice = new THREE.Mesh(geometry, material);
        slice.castShadow = true;
        slice.receiveShadow = true;

        // Radial offset calculation for hover expansion
        const midAngle = startAngle + angle / 2;
        const label = String(row[labelColIdx] ?? `Slice ${i + 1}`);

        slice.userData = {
          label,
          valueName: valueColName,
          value: `${val.toLocaleString()} (${(fraction * 100).toFixed(1)}%)`,
          midAngle,
          baseColor: colorHex,
        };

        chartGroup.add(slice);
        interactiveObjectsRef.current.push(slice);

        startAngle = endAngle;
      });

      if (controlsRef.current && cameraRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        cameraRef.current.position.set(0, 18, 16);
      }
    }
  }, [chartType, theme, labelColIdx, valueColIdx, zColIdx, showGrid, columns, result.rows]);

  // Animation Loop (Orbit Controls & Auto-Rotate)
  useEffect(() => {
    const renderLoop = () => {
      if (controlsRef.current) {
        controlsRef.current.autoRotate = autoRotate;
        controlsRef.current.autoRotateSpeed = 2.0;
        controlsRef.current.update();
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [autoRotate]);

  // Raycaster Pointer Move Handler for Hover Tooltips
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = mountRef.current;
    if (!container || !cameraRef.current || interactiveObjectsRef.current.length === 0) return;

    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    const intersects = raycaster.intersectObjects(interactiveObjectsRef.current, true);

    if (intersects.length > 0) {
      const topObj = intersects[0].object;
      const data = topObj.userData;

      if (data && data.label) {
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          label: data.label,
          valueName: data.valueName,
          value: data.value,
          extraInfo: data.extraInfo,
        });

        // Hover scale highlight
        container.style.cursor = "pointer";
        return;
      }
    }

    container.style.cursor = "grab";
    setTooltip(null);
  };

  // High-Res Image Export (PNG)
  const handleExportPNG = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    // Force high quality single frame render
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");

    const link = document.createElement("a");
    link.download = `3d-chart-${chartType}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="three-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="three-modal-container">
        {/* Header Control Toolbar */}
        <div className="three-modal-header">
          <div className="three-modal-title">
            <span className="three-modal-icon">📊</span>
            <div>
              <h3>3D Data Visualization</h3>
              <span className="three-modal-subtitle">
                {result.rows.length.toLocaleString()} total rows loaded
              </span>
            </div>
          </div>

          <div className="three-controls-bar">
            {/* Chart Type Picker */}
            <div className="control-group">
              <label>Chart Style</label>
              <div className="button-toggle-group">
                <button
                  type="button"
                  className={chartType === "bar" ? "active" : ""}
                  onClick={() => setChartType("bar")}
                  title="3D Extruded Bar / Column Chart"
                >
                  🏢 3D Bars
                </button>
                <button
                  type="button"
                  className={chartType === "scatter" ? "active" : ""}
                  onClick={() => setChartType("scatter")}
                  title="3D Spheres Scatter Plot"
                >
                  🌌 Scatter
                </button>
                <button
                  type="button"
                  className={chartType === "surface" ? "active" : ""}
                  onClick={() => setChartType("surface")}
                  title="3D Mesh Terrain Elevation Heatmap"
                >
                  ⛰️ Surface
                </button>
                <button
                  type="button"
                  className={chartType === "donut" ? "active" : ""}
                  onClick={() => setChartType("donut")}
                  title="Floating 3D Donut / Pie Chart"
                >
                  🍩 Donut
                </button>
              </div>
            </div>

            {/* Column Selectors */}
            <div className="control-group">
              <label>X (Category)</label>
              <select value={labelColIdx} onChange={(e) => setLabelColIdx(Number(e.target.value))}>
                {columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.name} {!c.isNumeric ? "(Text)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label>Y (Height / Metric)</label>
              <select value={valueColIdx} onChange={(e) => setValueColIdx(Number(e.target.value))}>
                {columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.name} {c.isNumeric ? "★ (Numeric)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {chartType !== "donut" && chartType !== "surface" && (
              <div className="control-group">
                <label>Z (Group / Depth)</label>
                <select value={zColIdx} onChange={(e) => setZColIdx(Number(e.target.value))}>
                  <option value={-1}>(None)</option>
                  {columns.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Theme Selector */}
            <div className="control-group">
              <label>Theme</label>
              <select value={theme} onChange={(e) => setTheme(e.target.value as ColorTheme3D)}>
                <option value="neon">⚡ Neon Cyber</option>
                <option value="metallic">👑 Metallic Gold</option>
                <option value="corporate">💼 Corporate Blue</option>
                <option value="sunset">🌅 Sunset Gold</option>
                <option value="synthwave">🌆 Synthwave</option>
              </select>
            </div>

            {/* Toggles & Export */}
            <div className="control-group-row">
              <button
                type="button"
                className={`secondary-btn ${autoRotate ? "active" : ""}`}
                onClick={() => setAutoRotate(!autoRotate)}
                title="Continuous 360 Camera Rotation"
              >
                🔄 Auto-Rotate
              </button>

              <button
                type="button"
                className={`secondary-btn ${showGrid ? "active" : ""}`}
                onClick={() => setShowGrid(!showGrid)}
                title="Toggle Base Grid Floor"
              >
                📐 Grid Floor
              </button>

              <button
                type="button"
                className="export-png-btn"
                onClick={handleExportPNG}
                title="Export high resolution PNG screenshot"
              >
                📸 Export PNG
              </button>

              <button type="button" className="close-modal-btn" onClick={onClose} title="Close 3D View (Esc)">
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* 3D WebGL Canvas Area */}
        <div
          className="three-canvas-viewport"
          ref={mountRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setTooltip(null)}
        >
          {/* Floating Hover Tooltip */}
          {tooltip && (
            <div
              className="three-tooltip"
              style={{
                left: `${Math.min(tooltip.x + 15, (mountRef.current?.clientWidth || 800) - 200)}px`,
                top: `${Math.max(tooltip.y - 45, 15)}px`,
              }}
            >
              <div className="tooltip-title">{tooltip.label}</div>
              <div className="tooltip-row">
                <span className="tooltip-metric">{tooltip.valueName}:</span>
                <span className="tooltip-value">{tooltip.value}</span>
              </div>
              {tooltip.extraInfo && <div className="tooltip-extra">{tooltip.extraInfo}</div>}
            </div>
          )}

          {/* Navigation Overlay Hints */}
          <div className="three-hud-instructions">
            <span>🖱️ Drag to Orbit</span>
            <span>Right-Click to Pan</span>
            <span>Scroll to Zoom</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThreeDChartModal;
