"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMotionValue, useSpring } from "framer-motion";

/* ------------------------------------------------------------------ *
 * Shared noise / flow field used by both layers so the plasma sheet
 * and the particles obey the same currents.
 * ------------------------------------------------------------------ */
const FLOW = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865,0.366025403,-0.577350269,0.024390243);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for(int i = 0; i < 4; i++){
      v += a * snoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  /* Gravitational disturbance: the flow curves *around* the pointer and
     relaxes back once it leaves. Never an attractor, never a trail. */
  vec2 disturb(vec2 p, vec2 c, float strength){
    vec2 d = p - c;
    float r = length(d);
    float falloff = exp(-r * r * 7.0);
    vec2 tangent = vec2(-d.y, d.x) / max(r, 0.0001);
    return tangent * falloff * strength * 0.22 + normalize(d + 1e-5) * falloff * strength * 0.06;
  }
`;

/* ------------------------------ plasma sheet ------------------------------ */

const sheetVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const sheetFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2  uPointer;
  uniform float uPointerStrength;
  uniform float uAspect;
  uniform float uIntensity;
  ${FLOW}

  void main(){
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec2 c = (uPointer - 0.5) * vec2(uAspect, 1.0);

    p += disturb(p, c, uPointerStrength);

    float t = uTime * 0.03;

    // layered, slowly drifting magnetic currents — read as filaments, not fire
    float warp = fbm(p * 1.1 + vec2(t, -t * 0.6));
    vec2 q = p + vec2(warp * 0.4, fbm(p * 0.9 - t) * 0.35);
    float lines = fbm(vec2(q.x * 1.6, q.y * 3.2 + warp * 1.6 + t * 1.2));

    float filaments = smoothstep(0.35, 1.0, abs(lines));
    float core = exp(-pow(length(p * vec2(0.62, 1.15)) * 1.35, 2.0));

    float energy = core * (0.2 + 0.95 * filaments);
    energy *= uIntensity;

    vec3 deep   = vec3(0.024, 0.027, 0.035);
    vec3 ember  = vec3(0.42, 0.16, 0.03);
    vec3 solar  = vec3(1.0, 0.48, 0.11);
    vec3 gold   = vec3(1.0, 0.80, 0.52);

    vec3 col = deep;
    col = mix(col, ember, clamp(energy * 1.6, 0.0, 1.0));
    col = mix(col, solar, clamp(pow(energy, 2.2) * 1.1, 0.0, 1.0));
    col = mix(col, gold, clamp(pow(energy, 5.0) * 0.8, 0.0, 1.0));

    // vignette keeps the focal point centred and the frame quiet
    float vig = smoothstep(1.15, 0.15, length(p));
    col *= 0.34 + 0.66 * vig;
    col *= vig * 1.05;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function PlasmaSheet({
  pointer,
  strength,
}: {
  pointer: React.RefObject<THREE.Vector2>;
  strength: React.RefObject<number>;
}) {
  const { viewport, size } = useThree();
  const material = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uPointerStrength: { value: 0 },
      uAspect: { value: 1 },
      uIntensity: { value: 1 },
    }),
    [],
  );

  useFrame((_, delta) => {
    if (!material.current) return;
    const u = material.current.uniforms;
    u.uTime.value += delta;
    u.uPointer.value.copy(pointer.current);
    u.uPointerStrength.value = strength.current;
    u.uAspect.value = size.width / size.height;
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={sheetVertex}
        fragmentShader={sheetFragment}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ------------------------------ particles ------------------------------ */

const pointsVertex = /* glsl */ `
  precision highp float;
  attribute float aSeed;
  attribute float aScale;
  uniform float uTime;
  uniform vec2  uPointer;
  uniform float uPointerStrength;
  uniform float uAspect;
  varying float vAlpha;
  ${FLOW}

  void main(){
    vec2 p = position.xy;
    float t = uTime * 0.02 + aSeed * 6.2831;

    // advect along the same currents as the sheet
    float n1 = fbm(p * 0.55 + vec2(t, -t * 0.7));
    float n2 = fbm(p * 0.42 - vec2(t * 0.8, t));
    vec2 drift = vec2(n1, n2) * 1.35;
    p += drift;

    // slow continuous travel with wrap so the field never empties
    p.x = mod(p.x + uTime * 0.035 * (0.35 + aScale) + 8.0, 16.0) - 8.0;

    vec2 c = uPointer * vec2(uAspect, 1.0) * 6.0;
    p += disturb(p * 0.16, c * 0.16, uPointerStrength) * 6.0;

    vec4 mv = modelViewMatrix * vec4(p, position.z, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.6 + aScale * 1.8) * (14.0 / -mv.z) * 3.0;

    float edge = smoothstep(8.0, 3.6, abs(p.x)) * smoothstep(5.0, 2.2, abs(p.y));
    vAlpha = edge * (0.18 + 0.42 * aScale);
  }
`;

const pointsFragment = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    vec3 col = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.92, 0.78), a);
    gl_FragColor = vec4(col, a * vAlpha);
  }
`;

function Embers({
  pointer,
  strength,
  count = 1500,
}: {
  pointer: React.RefObject<THREE.Vector2>;
  strength: React.RefObject<number>;
  count?: number;
}) {
  const { size } = useThree();
  const material = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const scales = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = 0;
      seeds[i] = Math.random();
      scales[i] = Math.pow(Math.random(), 2.2);
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    g.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    return g;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2() },
      uPointerStrength: { value: 0 },
      uAspect: { value: 1 },
    }),
    [],
  );

  useFrame((_, delta) => {
    if (!material.current) return;
    const u = material.current.uniforms;
    u.uTime.value += delta;
    u.uPointer.value.set(
      pointer.current.x - 0.5,
      -(pointer.current.y - 0.5),
    );
    u.uPointerStrength.value = strength.current;
    u.uAspect.value = size.width / size.height;
  });

  return (
    <points geometry={geometry} frustumCulled={false} position={[0, 0, 1]}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={pointsVertex}
        fragmentShader={pointsFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ------------------------------ canvas shell ------------------------------ */

export default function SolarField({
  showPlasma = true,
  particleCount = 1500,
}: {
  /** The animated orange nebula/plasma sheet. Defaults on — unchanged
   *  for the full site. Turn off for a quieter, particles-only field. */
  showPlasma?: boolean;
  /** Embers/particle count. Defaults to the full site's density. */
  particleCount?: number;
}) {
  const pointer = useRef(new THREE.Vector2(0.5, 0.5));
  const strength = useRef(0);

  // spring-lagged pointer: the disturbance trails the cursor and relaxes
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 60, damping: 22, mass: 1.1 });
  const sy = useSpring(py, { stiffness: 60, damping: 22, mass: 1.1 });
  const presence = useMotionValue(0);
  const sPresence = useSpring(presence, { stiffness: 30, damping: 20 });

  return (
    <div
      className="absolute inset-0"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
        presence.set(1);
      }}
      onPointerLeave={() => presence.set(0)}
    >
      <Canvas
        gl={{ antialias: false, alpha: false, powerPreference: "low-power" }}
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 6], fov: 50 }}
        onCreated={({ gl }) => gl.setClearColor("#060709", 1)}
        frameloop="always"
      >
        <FrameSync
          pointer={pointer}
          strength={strength}
          sx={sx}
          sy={sy}
          presence={sPresence}
        />
        {showPlasma && <PlasmaSheet pointer={pointer} strength={strength} />}
        <Embers pointer={pointer} strength={strength} count={particleCount} />
      </Canvas>
    </div>
  );
}

function FrameSync({
  pointer,
  strength,
  sx,
  sy,
  presence,
}: {
  pointer: React.RefObject<THREE.Vector2>;
  strength: React.RefObject<number>;
  sx: { get: () => number };
  sy: { get: () => number };
  presence: { get: () => number };
}) {
  useFrame(() => {
    pointer.current.set(sx.get(), sy.get());
    strength.current = presence.get();
  });
  return null;
}
