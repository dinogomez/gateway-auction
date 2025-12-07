"use client";

import { useEffect, useRef } from "react";

/**
 * CRT Effect - Balatro-style shader effects
 * Based on LÖVE2D CRT shader with:
 * - Flickering
 * - Scanlines
 * - Vignette
 * - Static noise
 *
 * Uses WebGL for the animated noise/flicker, CSS for scanlines/vignette
 */

// Noise/flicker fragment shader (overlay only - doesn't process page content)
const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  uniform float u_time;
  uniform vec2 u_resolution;

  varying vec2 v_uv;

  // Random function
  float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = v_uv;

    // ====== SCANLINES ======
    float scanline = sin(uv.y * u_resolution.y * 1.5) * 0.04;

    // ====== FLICKER ======
    float flicker = 0.98 + 0.02 * sin(u_time * 15.0);

    // ====== VIGNETTE ======
    vec2 vPos = (uv - 0.5) * 1.8;
    float vignette = 1.0 - dot(vPos, vPos);
    vignette = clamp(vignette, 0.0, 1.0);
    vignette = pow(vignette, 1.5);

    // ====== NOISE ======
    float noise = rand(uv * u_resolution + u_time * 60.0) * 0.03;

    // Combine effects - output as semi-transparent overlay
    float darkness = (1.0 - vignette) * 0.7;
    float scanEffect = scanline * 0.5;
    float flickerDark = (1.0 - flicker) * 0.3;

    // Black overlay with varying opacity for vignette + scanlines
    float alpha = darkness + scanEffect + flickerDark;

    // Add noise as slight color variation
    vec3 col = vec3(noise * 0.5);

    gl_FragColor = vec4(col, alpha);
  }
`;

export function CRTEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize WebGL
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
    });
    if (!gl) {
      console.warn("WebGL not supported, CRT effect disabled");
      return;
    }
    glRef.current = gl;

    // Compile shaders
    const vertShader = gl.createShader(gl.VERTEX_SHADER);
    const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertShader || !fragShader) return;

    gl.shaderSource(vertShader, VERTEX_SHADER);
    gl.compileShader(vertShader);
    if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
      console.error("Vertex shader error:", gl.getShaderInfoLog(vertShader));
      return;
    }

    gl.shaderSource(fragShader, FRAGMENT_SHADER);
    gl.compileShader(fragShader);
    if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
      console.error("Fragment shader error:", gl.getShaderInfoLog(fragShader));
      return;
    }

    // Create program
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return;
    }
    programRef.current = program;

    // Set up geometry (fullscreen quad)
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Render loop
    const render = () => {
      if (!canvas || !gl || !program) return;

      // Resize if needed
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      // Set uniforms
      const timeLoc = gl.getUniformLocation(program, "u_time");
      const resLoc = gl.getUniformLocation(program, "u_resolution");

      const time = (Date.now() - startTimeRef.current) / 1000;
      gl.uniform1f(timeLoc, time);
      gl.uniform2f(resLoc, width, height);

      // Draw
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationRef.current = requestAnimationFrame(render);
    };

    startTimeRef.current = Date.now();
    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999]"
      style={{
        width: "100vw",
        height: "100vh",
      }}
    />
  );
}
