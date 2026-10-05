import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type Quality = 'high' | 'medium' | 'low';

/** Colour grading: exposure, contrast, saturation, teal/orange split-toning, vignette, grain, slight chromatic aberration. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uContrast: { value: 1.08 },
    uSaturation: { value: 0.92 },
    uShadows: { value: new THREE.Vector3(0.0, 0.03, 0.06) },   // teal shadows
    uHighlights: { value: new THREE.Vector3(0.07, 0.02, -0.04) }, // warm highlights
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uAberration: { value: 0.0015 },
    uHurt: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uContrast, uSaturation, uVignette, uGrain, uAberration, uHurt;
    uniform vec3 uShadows, uHighlights;
    varying vec2 vUv;
    float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float ab = uAberration * (1.0 + uHurt * 4.0);
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * ab).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ab).b);
      // linear-space grade (tone mapping happens in OutputPass afterwards)
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      float lw = clamp(l * 1.6, 0.0, 1.0);
      c += uShadows * (1.0 - lw) * 0.6 + uHighlights * lw * l;
      c = max(vec3(0.0), (c - 0.18) * uContrast + 0.18);
      float v = smoothstep(0.85, 0.2, length(d) * (1.0 + uVignette));
      c *= mix(1.0 - uVignette, 1.0, v);
      c = mix(c, c * vec3(1.4, 0.5, 0.5), uHurt * (1.0 - v) * 0.8);
      c += (rand(vUv * 731.0 + uTime) - 0.5) * uGrain * (0.4 + l);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class PostFX {
  composer: EffectComposer;
  quality: Quality;
  private bloom: UnrealBloomPass;
  private gtao: GTAOPass;
  private bokeh: BokehPass;
  private grade: ShaderPass;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, quality: Quality) {
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, size.x / 2, size.y / 2); // half-res AO
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.4, thickness: 1.5, scale: 1.2, samples: 8 });
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.65, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.bokeh = new BokehPass(scene, camera, { focus: 20, aperture: 0.00045, maxblur: 0.006 });
    this.composer.addPass(this.bokeh);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.quality = quality;
    this.setQuality(quality);
  }

  /** Max device-pixel-ratio per tier — the single biggest GPU cost on retina / phone screens */
  static dpr(q: Quality, mobile: boolean) {
    const cap = q === 'high' ? 1.5 : q === 'medium' ? (mobile ? 1.0 : 1.25) : (mobile ? 0.8 : 1.0);
    return Math.min(devicePixelRatio, cap);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.gtao.enabled = q === 'high';
    this.bokeh.enabled = q === 'high';
    this.bloom.enabled = q !== 'low';
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.needsUpdate = true;
    const s = this.renderer.getSize(new THREE.Vector2());
    this.setSize(s.x, s.y);
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    // bloom is soft anyway: run it at half resolution
    this.bloom.setSize(w * this.renderer.getPixelRatio() / 2, h * this.renderer.getPixelRatio() / 2);
    this.gtao.setSize(w * this.renderer.getPixelRatio() / 2, h * this.renderer.getPixelRatio() / 2);
  }

  /** focus: distance from camera to the player; hurt 0..1 */
  render(dt: number, focus: number, hurt: number) {
    const u = this.grade.uniforms;
    u.uTime.value = (u.uTime.value + dt) % 100;
    u.uHurt.value = hurt;
    (this.bokeh.uniforms as Record<string, { value: number }>).focus.value = focus;
    if (this.quality === 'low') { this.renderer.render(this.scene, this.camera); return; } // no post at all
    this.composer.render(dt);
  }
}
