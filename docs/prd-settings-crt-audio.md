# PRD: Settings Panel with CRT Effects & Audio Controls

## Overview

Add a settings panel accessible via a gear icon in the navigation bar. The panel allows users to customize visual CRT/retro display effects and adjust audio levels for sound effects and music.

---

## Goals

- Enhance the 8-bit retro aesthetic with optional CRT visual effects
- Give users control over audio levels
- Persist settings across sessions (localStorage)
- Minimal performance impact on gameplay

---

## User Stories

1. As a player, I want to toggle CRT effects on/off so I can choose my preferred visual style
2. As a player, I want to adjust the intensity of individual CRT effects (scanlines, curvature, etc.)
3. As a player, I want to control music and sound effect volumes independently
4. As a player, I want my settings to persist when I return to the game

---

## Feature Scope

### Settings Panel UI

**Trigger:** Gear icon (⚙️) in the navigation bar

**Behavior:**
- Click opens a modal/drawer overlay
- Click outside or X button closes
- Settings apply in real-time (live preview)
- Changes auto-save to localStorage

**Layout:**
```
┌─────────────────────────────────────┐
│  Settings                        ✕  │
├─────────────────────────────────────┤
│                                     │
│  🖥️ DISPLAY                         │
│  ─────────────────────────────────  │
│  CRT Effect         [━━━━━○━━] ON   │
│                                     │
│  Curvature          [━━○━━━━━━━]    │
│  Scanlines          [━━━━○━━━━━]    │
│  Glow               [━━━○━━━━━━]    │
│  Vignette           [━━━━━○━━━━]    │
│  Flicker            [○━━━━━━━━━]    │
│  Screen Color       [Amber ▼]       │
│                                     │
│  🔊 AUDIO                           │
│  ─────────────────────────────────  │
│  Master Volume      [━━━━━━━○━━]    │
│  Music              [━━━━━○━━━━]    │
│  Sound Effects      [━━━━━━━━○━]    │
│                                     │
│  [Reset to Defaults]                │
│                                     │
└─────────────────────────────────────┘
```

---

## Technical Specification

### 1. Settings State Management

**Location:** Global context or Zustand store

```typescript
interface Settings {
  display: {
    crtEnabled: boolean;
    curvature: number;      // 0-10, default: 3
    scanlines: number;      // 0-1, default: 0.3
    glow: number;           // 0-2, default: 0.5
    vignette: number;       // 0-1, default: 0.4
    flicker: number;        // 0-0.1, default: 0.02
    colorMode: 'amber' | 'green' | 'white' | 'rgb';
  };
  audio: {
    masterVolume: number;   // 0-1, default: 0.8
    musicVolume: number;    // 0-1, default: 0.5
    sfxVolume: number;      // 0-1, default: 0.7
  };
}
```

**Persistence:** localStorage key `auction-bluff-settings`

---

### 2. CRT Effect Implementation

Since this is a Next.js app with existing DOM, we use a hybrid approach: html2canvas captures the page, WebGL applies barrel distortion, and CSS handles the remaining effects (scanlines, vignette, flicker) for performance.

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Window                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  App Content (DOM)                                    │  │
│  │  - React components                                   │  │
│  │  - Game UI                                            │  │
│  │  - Hidden when CRT enabled                            │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                    html2canvas                               │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  WebGL Canvas (fullscreen)                            │  │
│  │  - Receives page capture as texture                   │  │
│  │  - Applies barrel distortion shader                   │  │
│  │  - Applies glow, chromatic aberration                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  CSS Overlay (pointer-events: none)                   │  │
│  │  - Scanlines (repeating gradient)                     │  │
│  │  - Vignette (radial gradient)                         │  │
│  │  - Flicker (CSS animation)                            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

#### Component: CRTEffect.tsx

Main wrapper component that orchestrates the effect:

```tsx
// components/CRTEffect.tsx
'use client';

import { useEffect, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { useSettings } from '@/hooks/useSettings';

export function CRTEffect({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const rafRef = useRef<number>(0);
  const lastCaptureRef = useRef<number>(0);

  const CAPTURE_INTERVAL = 100; // ms between captures (~10fps)

  // Initialize WebGL
  useEffect(() => {
    if (!settings.display.crtEnabled || !canvasRef.current) return;

    const gl = canvasRef.current.getContext('webgl');
    if (!gl) return;

    glRef.current = gl;
    
    // Compile shaders and create program
    const program = createShaderProgram(gl);
    programRef.current = program;

    // Create texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textureRef.current = texture;

    // Setup geometry
    setupGeometry(gl, program);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [settings.display.crtEnabled]);

  // Render loop
  const render = useCallback(async (time: number) => {
    if (!settings.display.crtEnabled) return;

    const gl = glRef.current;
    const program = programRef.current;
    const content = contentRef.current;
    const canvas = canvasRef.current;

    if (!gl || !program || !content || !canvas) {
      rafRef.current = requestAnimationFrame(render);
      return;
    }

    // Throttle html2canvas captures
    if (time - lastCaptureRef.current > CAPTURE_INTERVAL) {
      lastCaptureRef.current = time;

      // Capture DOM to canvas
      const capture = await html2canvas(content, {
        backgroundColor: null,
        scale: window.devicePixelRatio,
        logging: false,
        useCORS: true,
      });

      // Update WebGL texture
      gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, capture);
    }

    // Resize canvas if needed
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // Set uniforms
    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time * 0.001);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas.width, canvas.height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_curvature'), settings.display.curvature);
    gl.uniform1f(gl.getUniformLocation(program, 'u_glow'), settings.display.glow);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    rafRef.current = requestAnimationFrame(render);
  }, [settings.display]);

  // Start render loop
  useEffect(() => {
    if (settings.display.crtEnabled) {
      rafRef.current = requestAnimationFrame(render);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [settings.display.crtEnabled, render]);

  if (!settings.display.crtEnabled) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Original content - hidden but still interactive */}
      <div 
        ref={contentRef} 
        style={{ 
          position: 'fixed',
          inset: 0,
          opacity: 0,
          pointerEvents: 'auto',
        }}
      >
        {children}
      </div>

      {/* WebGL canvas with barrel distortion */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          pointerEvents: 'none',
        }}
      />

      {/* CSS effects overlay */}
      <CRTOverlay settings={settings.display} />
    </>
  );
}
```

#### WebGL Shader: Barrel Distortion

```glsl
// Fragment shader
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_curvature;
uniform float u_glow;

varying vec2 v_texCoord;

vec2 barrelDistortion(vec2 uv, float curvature) {
    uv = uv * 2.0 - 1.0;
    vec2 offset = abs(uv.yx) / vec2(curvature + 0.01);
    uv = uv + uv * offset * offset;
    uv = uv * 0.5 + 0.5;
    return uv;
}

vec3 sampleWithGlow(sampler2D tex, vec2 uv, vec2 resolution, float glow) {
    vec3 color = texture2D(tex, uv).rgb;
    
    if (glow > 0.0) {
        float blurSize = glow * 2.0 / resolution.x;
        for (float x = -2.0; x <= 2.0; x += 1.0) {
            for (float y = -2.0; y <= 2.0; y += 1.0) {
                color += texture2D(tex, uv + vec2(x, y) * blurSize).rgb * 0.04 * glow;
            }
        }
    }
    
    return color;
}

void main() {
    vec2 uv = barrelDistortion(v_texCoord, u_curvature);
    
    // Black outside curved bounds
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    // Sample with glow
    vec3 color = sampleWithGlow(u_texture, uv, u_resolution, u_glow);
    
    // Chromatic aberration
    float aberration = 0.002;
    color.r = texture2D(u_texture, uv + vec2(aberration, 0.0)).r;
    color.b = texture2D(u_texture, uv - vec2(aberration, 0.0)).b;
    
    gl_FragColor = vec4(color, 1.0);
}
```

#### CSS Overlay: Scanlines, Vignette, Flicker

These effects are applied via CSS for better performance (no need to re-render via WebGL):

```tsx
// components/CRTOverlay.tsx
export function CRTOverlay({ settings }: { settings: DisplaySettings }) {
  const colorFilter = getColorFilter(settings.colorMode);

  return (
    <div 
      className="crt-overlay"
      style={{ 
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1001,
      }}
    >
      {/* Scanlines */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: `repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, ${settings.scanlines * 0.3}),
            rgba(0, 0, 0, ${settings.scanlines * 0.3}) 1px,
            transparent 1px,
            transparent 2px
          )`,
        }}
      />

      {/* Vignette */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(
            ellipse at center,
            transparent 0%,
            transparent 40%,
            rgba(0, 0, 0, ${settings.vignette}) 100%
          )`,
        }}
      />

      {/* Flicker */}
      {settings.flicker > 0 && (
        <div 
          style={{
            position: 'absolute',
            inset: 0,
            animation: `crt-flicker ${0.05 + (1 - settings.flicker) * 0.15}s infinite`,
          }}
        />
      )}

      {/* Color tint */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          mixBlendMode: 'multiply',
          ...colorFilter,
        }}
      />
    </div>
  );
}

function getColorFilter(mode: string) {
  switch (mode) {
    case 'amber':
      return { backgroundColor: 'rgba(255, 176, 50, 0.15)' };
    case 'green':
      return { backgroundColor: 'rgba(50, 255, 100, 0.15)' };
    case 'white':
      return { backgroundColor: 'rgba(200, 220, 255, 0.05)' };
    default:
      return {};
  }
}
```

```css
/* globals.css */
@keyframes crt-flicker {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; background: rgba(255, 255, 255, 0.02); }
}
```

#### Interaction Handling

Since the WebGL canvas blocks mouse events, user interactions go through the hidden (but still present) DOM underneath:

```tsx
// The content div has opacity: 0 but pointerEvents: 'auto'
// This means:
// 1. User sees the WebGL-rendered version
// 2. Clicks/hovers hit the real DOM underneath
// 3. DOM changes trigger re-capture via html2canvas
```

**Known limitation:** There's visual latency between clicking and seeing the result (~100ms). This actually fits the retro aesthetic.

#### Performance Optimizations

1. **Throttled capture:** Only run html2canvas every 100ms (10fps)
2. **Skip unchanged frames:** Use MutationObserver to detect DOM changes
3. **Reduced scale on mobile:** Capture at 0.5x resolution on mobile devices
4. **Disable on low battery:** Check `navigator.getBattery()` API

```tsx
// Optional: Only capture when DOM changes
useEffect(() => {
  const observer = new MutationObserver(() => {
    shouldCaptureRef.current = true;
  });
  
  if (contentRef.current) {
    observer.observe(contentRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  }
  
  return () => observer.disconnect();
}, []);
```

#### Dependencies

```bash
bun add html2canvas
```

#### Browser Support

- WebGL: All modern browsers
- html2canvas: All modern browsers (some CSS features may not render perfectly)
- Known issues:
  - External images need CORS headers
  - Some CSS filters may not capture
  - iframe content won't capture

---

### 3. Audio System

**Integration:** Hook into existing audio playback (if any) or implement new

```typescript
// lib/audio.ts
class AudioManager {
  private musicGain: GainNode;
  private sfxGain: GainNode;
  private masterGain: GainNode;
  private context: AudioContext;

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.sfxGain = this.context.createGain();
    
    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
  }

  setMasterVolume(value: number) {
    this.masterGain.gain.value = value;
  }

  setMusicVolume(value: number) {
    this.musicGain.gain.value = value;
  }

  setSfxVolume(value: number) {
    this.sfxGain.gain.value = value;
  }

  playMusic(src: string) { /* ... */ }
  playSfx(src: string) { /* ... */ }
}

export const audio = new AudioManager();
```

**Usage with settings:**
```typescript
// In settings context/store
useEffect(() => {
  audio.setMasterVolume(settings.audio.masterVolume);
  audio.setMusicVolume(settings.audio.musicVolume);
  audio.setSfxVolume(settings.audio.sfxVolume);
}, [settings.audio]);
```

---

### 4. Nav Integration

Add gear icon to existing nav component:

```tsx
// In nav component
<button 
  onClick={() => setSettingsOpen(true)}
  className="nav-icon"
  aria-label="Settings"
>
  <GearIcon /> {/* from lucide-react or similar */}
</button>
```

---

## File Structure

```
src/
├── components/
│   ├── settings/
│   │   ├── SettingsModal.tsx
│   │   ├── DisplaySettings.tsx
│   │   ├── AudioSettings.tsx
│   │   └── SettingsSlider.tsx
│   ├── crt/
│   │   ├── CRTEffect.tsx          # Main wrapper component
│   │   ├── CRTOverlay.tsx         # CSS scanlines/vignette/flicker
│   │   ├── useWebGL.ts            # WebGL setup hook
│   │   └── shaders.ts             # Vertex/fragment shader source
│   └── nav/
│       └── SettingsGear.tsx
├── hooks/
│   └── useSettings.ts
├── lib/
│   ├── audio.ts
│   └── webgl-utils.ts             # Shader compilation helpers
├── stores/
│   └── settingsStore.ts (if using Zustand)
└── styles/
    └── crt.css
```

---

## Implementation Phases

### Phase 1: Settings Infrastructure
- [ ] Create settings store/context with localStorage persistence
- [ ] Build SettingsModal component with slider controls
- [ ] Add gear icon to nav
- [ ] Wire up settings state to localStorage

### Phase 2: CRT Effect - CSS Layer
- [ ] Create CRTOverlay component (scanlines, vignette, flicker)
- [ ] Add color mode tinting (amber/green/white/rgb)
- [ ] Test CSS effects in isolation
- [ ] Add `@keyframes crt-flicker` animation

### Phase 3: CRT Effect - WebGL Barrel Distortion
- [ ] Install html2canvas dependency
- [ ] Create WebGL shader program (barrel distortion + glow + chromatic aberration)
- [ ] Build CRTEffect wrapper component
- [ ] Implement throttled html2canvas capture loop
- [ ] Handle pointer events pass-through to hidden DOM
- [ ] Add MutationObserver optimization (capture only on changes)

### Phase 4: Audio Integration
- [ ] Implement AudioManager class with Web Audio API
- [ ] Add background music (8-bit style tracks)
- [ ] Add sound effects for game actions (bid, win, lose, etc.)
- [ ] Wire up volume controls to AudioManager

### Phase 5: Polish & Optimization
- [ ] Add keyboard shortcut for settings (Esc)
- [ ] Preset profiles ("Classic CRT", "Modern", "Minimal")
- [ ] Reduce capture resolution on mobile
- [ ] Add "reduce motion" accessibility check
- [ ] Sound preview when adjusting SFX volume slider
- [ ] Performance profiling and optimization

---

## Default Values

| Setting | Default | Range |
|---------|---------|-------|
| CRT Enabled | true | boolean |
| Curvature | 3 | 0-10 |
| Scanlines | 0.3 | 0-1 |
| Glow | 0.5 | 0-2 |
| Vignette | 0.4 | 0-1 |
| Flicker | 0.02 | 0-0.1 |
| Color Mode | "amber" | enum |
| Master Volume | 0.8 | 0-1 |
| Music Volume | 0.5 | 0-1 |
| SFX Volume | 0.7 | 0-1 |

---

## Open Questions

1. **Audio assets:** Do we have 8-bit music/SFX already, or need to source/create?
2. **Mobile:** Should CRT effects be disabled/reduced on mobile for performance? (html2canvas is heavier on mobile)
3. **Accessibility:** Should there be a "reduce motion" check that disables flicker?
4. **Capture rate:** Is 10fps (100ms interval) acceptable, or should we go higher/lower?
5. **Fallback:** Should we offer CSS-only mode for users with WebGL issues or low-end devices?

---

## Technical Considerations

### html2canvas + WebGL Approach Trade-offs

**Pros:**
- True barrel distortion like Balatro/CRT monitors
- Full shader control for glow, chromatic aberration
- Works with existing React/Next.js DOM
- No need to rewrite UI as canvas drawings

**Cons:**
- ~100ms latency between DOM changes and visual update
- Higher CPU/memory usage than CSS-only
- html2canvas has edge cases (external images, some CSS)
- Adds ~40KB to bundle (html2canvas)

**Mitigation:**
- The latency actually fits the retro aesthetic
- Throttled captures reduce CPU load
- MutationObserver prevents unnecessary captures
- Offer CSS-only fallback for low-end devices

### Why Not Pure CSS?

CSS can do scanlines, vignette, and flicker, but cannot do true barrel distortion. SVG filters (`feDisplacementMap`) exist but have poor browser support and can't achieve the curved-screen effect convincingly.

### Why Not Render Everything to Canvas?

This would require rebuilding the entire UI using Canvas 2D API instead of React components. While it would give the best performance and most authentic effect, it's not practical for an existing Next.js app with established components.

---

## Out of Scope

- Per-game-mode settings
- Cloud sync of settings
- Custom color picker for screen tint
- Recording/replay with effects baked in
