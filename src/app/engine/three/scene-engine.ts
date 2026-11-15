import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Sphere,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { InjectionToken } from '@angular/core';
import type { ViewportBackground } from '../../core/models/generation.model';

export interface SceneEngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly background?: ViewportBackground;
  readonly grid?: boolean;
  readonly autoRotate?: boolean;
}

/**
 * The slice of {@link SceneEngine} the viewport component uses.
 *
 * Depending on the interface (and on a factory for it) keeps the component
 * testable without a GPU: a fake engine can stand in and assert that models
 * actually reach the scene.
 */
export interface ViewportEngine {
  readonly content: Object3D | null;
  setContent(object: Object3D | null): void;
  setBackground(background: ViewportBackground): void;
  setGrid(visible: boolean): void;
  setAutoRotate(enabled: boolean): void;
  frameContent(): void;
  resize(): void;
  snapshot(): string;
  dispose(): void;
}

export interface ViewportEngineFactory {
  /** Whether this browser can provide a WebGL context at all. */
  isSupported(): boolean;
  create(options: SceneEngineOptions): ViewportEngine;
}

export const VIEWPORT_ENGINE_FACTORY = new InjectionToken<ViewportEngineFactory>(
  'VIEWPORT_ENGINE_FACTORY',
  {
    providedIn: 'root',
    factory: (): ViewportEngineFactory => ({
      isSupported: () => SceneEngine.isSupported(),
      create: (options) => new SceneEngine(options),
    }),
  },
);

let supportProbe: boolean | null = null;

const BACKGROUND_COLORS: Readonly<Record<ViewportBackground, Color | null>> = {
  // `null` means "transparent" — the CSS behind the canvas supplies the look.
  studio: null,
  transparent: null,
  dark: new Color(0x0b0e15),
  light: new Color(0xf4f6fb),
};

/**
 * Framework-agnostic three.js viewport.
 *
 * Deliberately free of Angular so it can be unit-tested, reused or swapped: the
 * component owns the DOM element, this class owns everything GPU-side.
 *
 * Rendering is dirty-checked — the loop only issues a draw call when the camera
 * moved, the auto-rotate is running, or something in the scene changed — which
 * keeps a laptop fan quiet while the user is reading the settings panel.
 */
export class SceneEngine implements ViewportEngine {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly controls: OrbitControls;

  #content: Object3D | null = null;
  #grid: GridHelper | null = null;
  #ground: Mesh | null = null;
  #dirty = true;
  #disposed = false;
  #resizeObserver: ResizeObserver | null = null;
  #environment: PMREMGenerator | null = null;
  #environmentTexture: ReturnType<PMREMGenerator['fromScene']>['texture'] | null = null;
  #room: RoomEnvironment | null = null;

  /**
   * Whether this browser can give us a WebGL context.
   *
   * Checked once and cached: the probe itself allocates a context, and the
   * viewport needs the answer before it builds anything.
   */
  static isSupported(): boolean {
    if (supportProbe !== null) {
      return supportProbe;
    }

    try {
      const canvas = document.createElement('canvas');
      supportProbe = canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
    } catch {
      supportProbe = false;
    }

    return supportProbe;
  }

  constructor(private readonly options: SceneEngineOptions) {
    const { canvas } = options;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      // Required so `snapshot()` can read the framebuffer after a render.
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;

    this.camera = new PerspectiveCamera(38, 1, 0.01, 200);
    this.camera.position.set(0, 1.6, 3.4);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.92;
    this.controls.autoRotate = options.autoRotate ?? false;
    this.controls.autoRotateSpeed = 0.9;
    this.controls.addEventListener('change', () => this.#markDirty());

    this.#setupLighting();
    this.setBackground(options.background ?? 'studio');
    this.setGrid(options.grid ?? true);
    this.#observeResize(canvas);

    this.renderer.setAnimationLoop(() => this.#tick());
  }

  /** The object currently in the scene, or `null` when the viewport is empty. */
  get content(): Object3D | null {
    return this.#content;
  }

  setContent(object: Object3D | null): void {
    if (this.#content !== null) {
      this.scene.remove(this.#content);
    }

    this.#content = object;
    if (object !== null) {
      this.scene.add(object);
    }

    this.#markDirty();
  }

  /** Frames the current content, or restores the default view when empty. */
  frameContent(): void {
    const content = this.#content;
    if (content === null) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, 1.6, 3.4);
      this.controls.update();
      this.#markDirty();
      return;
    }

    const sphere = new Sphere();
    content.updateWorldMatrix(true, true);

    // `expandByObject` needs a bounding box; points and meshes both provide one.
    const box = boundingBoxOf(content);
    if (box === null) {
      this.controls.update();
      return;
    }
    box.getBoundingSphere(sphere);

    const radius = Math.max(sphere.radius, 0.001);
    const fov = (this.camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fov / 2)) * 1.25;

    const direction = new Vector3(0.55, 0.62, 1).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.controls.target.copy(sphere.center);
    this.camera.near = Math.max(distance / 1000, 0.001);
    this.camera.far = distance * 12;
    this.camera.updateProjectionMatrix();

    this.controls.minDistance = radius * 0.4;
    this.controls.maxDistance = distance * 6;
    this.controls.update();

    this.#layoutGround(sphere.center.y - radius * 0.02, radius);
    this.#markDirty();
  }

  setBackground(background: ViewportBackground): void {
    const color = BACKGROUND_COLORS[background];
    this.scene.background = color;
    this.renderer.setClearAlpha(color === null ? 0 : 1);

    if (this.#ground !== null) {
      const material = this.#ground.material as ShadowMaterial;
      material.opacity = background === 'light' ? 0.18 : 0.32;
    }

    this.#markDirty();
  }

  setGrid(visible: boolean): void {
    if (visible && this.#grid === null) {
      const grid = new GridHelper(8, 32, 0x4a5570, 0x2a3145);
      grid.material.transparent = true;
      grid.material.opacity = 0.4;
      this.scene.add(grid);
      this.#grid = grid;
    } else if (!visible && this.#grid !== null) {
      this.scene.remove(this.#grid);
      this.#grid.geometry.dispose();
      this.#grid = null;
    }

    this.#markDirty();
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
    this.#markDirty();
  }

  resize(): void {
    const parent = this.options.canvas.parentElement;
    const width = Math.max(1, Math.floor(parent?.clientWidth ?? this.options.canvas.clientWidth));
    const height = Math.max(
      1,
      Math.floor(parent?.clientHeight ?? this.options.canvas.clientHeight),
    );

    if (this.options.canvas.width === width && this.options.canvas.height === height) {
      return;
    }

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.#markDirty();
  }

  /** Renders one frame and returns it as a PNG data URL (used by "save image"). */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;

    this.renderer.setAnimationLoop(null);
    this.#resizeObserver?.disconnect();
    this.controls.dispose();

    this.setContent(null);
    this.setGrid(false);

    if (this.#ground !== null) {
      this.scene.remove(this.#ground);
      this.#ground.geometry.dispose();
      (this.#ground.material as MeshStandardMaterial).dispose();
      this.#ground = null;
    }

    this.#environmentTexture?.dispose();
    this.#environment?.dispose();
    this.#room?.dispose();
    this.renderer.dispose();
  }

  // -- Internals ------------------------------------------------------------

  #setupLighting(): void {
    this.#environment = new PMREMGenerator(this.renderer);
    this.#room = new RoomEnvironment();
    this.#environmentTexture = this.#environment.fromScene(this.#room, 0.04).texture;
    this.scene.environment = this.#environmentTexture;
    this.scene.environmentIntensity = 0.75;

    const key = new DirectionalLight(0xffffff, 2.1);
    key.position.set(2.4, 3.6, 2.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);

    const fill = new DirectionalLight(0x93a9ff, 0.5);
    fill.position.set(-2.6, 1.4, -2.2);
    this.scene.add(fill);

    this.scene.add(new AmbientLight(0xffffff, 0.12));

    // Invisible plane that catches the shadow so the model does not float.
    const ground = new Mesh(
      new PlaneGeometry(40, 40),
      new ShadowMaterial({ opacity: 0.32, transparent: true, depthWrite: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.05;
    this.scene.add(ground);
    this.#ground = ground;
  }

  #layoutGround(y: number, radius: number): void {
    if (this.#ground !== null) {
      this.#ground.position.y = y;
    }
    if (this.#grid !== null) {
      this.#grid.position.y = y;
      const size = Math.max(2, Math.ceil(radius * 4));
      this.#grid.scale.setScalar(size / 8);
    }

    const key = this.scene.children.find((child): child is DirectionalLight => {
      return child instanceof DirectionalLight && child.castShadow;
    });
    if (key !== undefined) {
      const extent = Math.max(1, radius * 2.2);
      key.shadow.camera.left = -extent;
      key.shadow.camera.right = extent;
      key.shadow.camera.top = extent;
      key.shadow.camera.bottom = -extent;
      key.shadow.camera.near = 0.1;
      key.shadow.camera.far = extent * 8;
      key.shadow.camera.updateProjectionMatrix();
    }
  }

  #observeResize(canvas: HTMLCanvasElement): void {
    if (typeof ResizeObserver === 'undefined') {
      this.resize();
      return;
    }

    this.#resizeObserver = new ResizeObserver(() => this.resize());
    const target = canvas.parentElement ?? canvas;
    this.#resizeObserver.observe(target);
    this.resize();
  }

  #markDirty(): void {
    this.#dirty = true;
  }

  #tick(): void {
    if (this.#disposed) {
      return;
    }

    const cameraMoved = this.controls.update();
    if (!cameraMoved && !this.#dirty) {
      return;
    }

    this.#dirty = false;
    this.renderer.render(this.scene, this.camera);
  }
}

/** World-space bounds of an object, or `null` when it has no geometry. */
function boundingBoxOf(object: Object3D): Box3 | null {
  const box = new Box3().setFromObject(object);
  return box.isEmpty() ? null : box;
}
