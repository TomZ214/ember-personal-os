"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { useEmber } from "@/lib/store";
import type { CatStatus } from "./brain";
import { LAYOUT, Room, type RoomMode } from "./room";
import { loadCatGeometry } from "./catGeometry";

/**
 * The 3D view of the cat's room. Loaded only on the client and only when
 * needed (LazyPetScene): this module is where three.js comes in.
 *
 * React sets up the canvas, the light and the room, and hands the room its
 * settings; the room itself (room.ts) is plain three.js and runs the frame.
 * Rendering is on demand: frames are asked for while the view is on screen
 * and the tab visible, at half rate while the cat sleeps, never otherwise.
 */

export interface PetControls {
  /** fill the bowl; false if it is still full */
  feed(): boolean;
  /** drop a treat; false if there is none or one is already on the floor */
  treat(): boolean;
  /** roll the ball of yarn in */
  ball(): void;
  /** call the cat over */
  call(): void;
}

export interface PetSceneProps {
  mode: RoomMode;
  /** play with the laser pointer: the dot follows the pointer over the floor */
  laser?: boolean;
  /** receives the room's controls once it is up (and null when it goes) */
  onReady?: (controls: PetControls | null) => void;
  onStatus?: (status: CatStatus) => void;
}

export default function PetScene({ mode, laser = false, onReady, onStatus }: PetSceneProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [visible, setVisible] = useState(true);
  // reduced effects (Settings): fewer pixels, for battery and older iPads
  const reduced = useEmber((s) => s.settings.reducedEffects ?? false);
  const maxDpr = reduced ? 1 : mode === "widget" ? 1.5 : 1.75;
  const [measured, setDpr] = useState(() => Math.min(maxDpr, window.devicePixelRatio || 1));
  const dpr = Math.min(measured, maxDpr);
  const L = LAYOUT[mode];

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: "80px" });
    io.observe(el);
    const vis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  return (
    <div
      ref={wrap}
      className="absolute inset-0"
      // a vertical swipe still scrolls the page; sideways strokes pet the cat.
      // With the laser on, every move steers the dot.
      style={{ touchAction: laser ? "none" : "pan-y" }}
    >
      <Canvas
        frameloop="demand"
        dpr={dpr}
        camera={{ position: [L.camera[0], L.camera[1], L.camera[2]], fov: L.fov, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: mode === "widget" ? "low-power" : "default", toneMapping: THREE.NeutralToneMapping }}
        style={{ background: "transparent" }}
      >
        <PerformanceMonitor
          onDecline={() => setDpr(1)}
          onIncline={() => setDpr(Math.min(maxDpr, window.devicePixelRatio || 1))}
          flipflops={3}
          onFallback={() => setDpr(1)}
        />
        <hemisphereLight args={["#fff5ec", "#a89a94", 1.05]} />
        <directionalLight position={[2.4, 4, 3.6]} intensity={1.9} color="#fff0e0" />
        <directionalLight position={[-3, 2.4, -3]} intensity={1.3} color="#d6e4ff" />
        <Environment resolution={64} frames={1} environmentIntensity={0.55}>
          <Lightformer form="rect" intensity={2.4} position={[0, 4, 1.5]} rotation-x={Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer form="rect" intensity={1.1} color="#ffdcb8" position={[-4, 1.6, 1]} rotation-y={Math.PI / 2} scale={[3, 2, 1]} />
          <Lightformer form="ring" intensity={1.4} color="#dfe8ff" position={[3, 2, 3]} scale={1.4} />
        </Environment>
        <World mode={mode} laser={laser} onReady={onReady} onStatus={onStatus} active={onScreen && visible} />
      </Canvas>
    </div>
  );
}

/** read a CSS colour (any syntax the browser knows) as a three.js colour */
function cssColor(name: string, fallback: string): THREE.Color {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = fallback;
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  } catch {
    return new THREE.Color(fallback);
  }
}

function World({ mode, laser = false, onReady, onStatus, active }: PetSceneProps & { active: boolean }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const coat = useEmber((s) => s.pet.coat);
  const theme = useEmber((s) => s.settings.theme);
  const appearance = useEmber((s) => s.settings.appearance);
  const style = useEmber((s) => s.settings.surfaceStyle);
  const room = useRef<Room | null>(null);
  const status = useRef(onStatus);
  const ready = useRef(onReady);
  const laserOn = useRef(laser);

  useEffect(() => {
    status.current = onStatus;
    ready.current = onReady;
    laserOn.current = laser;
  });

  // the room lives as long as the canvas; a new coat is the same cat.
  // The body is built in a worker first (once per page load).
  useEffect(() => {
    let r: Room | null = null;
    let gone = false;
    void loadCatGeometry().then(() => {
      if (gone) return;
      r = new Room({
        mode,
        scene,
        camera: camera as THREE.PerspectiveCamera,
        dom: gl.domElement.parentElement ?? gl.domElement,
        coat: useEmber.getState().pet.coat,
      });
      const room_ = r;
      room_.onStatus = (s) => status.current?.(s);
      room_.laser = laserOn.current;
      room_.setAccent(cssColor("--primary", "#ff8a4c"));
      room.current = room_;
      ready.current?.({
        feed: () => room_.feed(),
        treat: () => room_.treat(),
        ball: () => room_.ball(),
        call: () => room_.call(),
      });
      invalidate();
    });
    return () => {
      gone = true;
      if (!r) return;
      ready.current?.(null);
      room.current = null;
      r.dispose();
    };
  }, [mode, scene, camera, gl, invalidate]);

  useEffect(() => {
    room.current?.setCoat(coat);
  }, [coat]);

  useEffect(() => {
    if (room.current) room.current.laser = laser;
  }, [laser]);

  // the theme lands on <html> in an effect of its own: read it a frame later
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      room.current?.setAccent(cssColor("--primary", "#ff8a4c"));
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [theme, appearance, style, invalidate]);

  useFrame((state, dt) => room.current?.frame(state, dt));

  return <Driver active={active} sleepy={() => !!room.current?.sleepy} />;
}

/** asks for frames while the room is on screen; half as many while the cat sleeps */
function Driver({ active, sleepy }: { active: boolean; sleepy: () => boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const asleep = useRef(sleepy);
  useEffect(() => {
    asleep.current = sleepy;
  });
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let n = 0;
    const loop = () => {
      n++;
      if (!asleep.current() || n % 2 === 0) invalidate();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, invalidate]);
  return null;
}
