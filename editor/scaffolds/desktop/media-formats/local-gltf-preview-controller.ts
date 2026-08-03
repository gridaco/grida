import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  HemisphereLight,
  LoadingManager,
  Material,
  MathUtils,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { LocalGltfBundle } from "./local-gltf-bundle";

/** Imperative Three.js host for the local 3D-format preview. */
export class LocalGltfPreviewController {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(45, 1, 0.01, 10_000);
  private readonly controls: OrbitControls;
  private readonly clock = new Clock();
  private readonly resizeObserver: ResizeObserver | null;
  private readonly onStatusChange: (
    status: LocalGltfPreviewController.Status
  ) => void;
  private gltf: GLTF | null = null;
  private mixer: AnimationMixer | null = null;
  private loadGeneration = 0;
  private active = false;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    options: LocalGltfPreviewController.Options = {}
  ) {
    this.onStatusChange = options.onStatusChange ?? (() => undefined);
    this.scene.background = new Color(0x111318);
    this.scene.add(new HemisphereLight(0xffffff, 0x3f4654, 2.4));
    const keyLight = new DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(4, 7, 5);
    this.scene.add(keyLight);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D asset preview"
    );
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.width = "100%";
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(this.resize);
    this.resizeObserver?.observe(this.container);
    this.resize();
    this.setActive(options.active ?? true);
  }

  async load(files: readonly File[]): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.loadGeneration;
    this.clearAsset();
    this.emit({ phase: "loading" });

    try {
      const bundle = LocalGltfBundle.open(files);
      const prepared = await bundle.read();
      if (!this.isCurrent(generation)) return;

      // The bundle has already folded every selected sidecar into this GLB.
      // An empty resource path prevents the loader from gaining ambient URL
      // authority; Draco and KTX2 decoders are intentionally not configured.
      const gltf = await localOnlyGltfLoader().parseAsync(prepared, "");
      if (!this.isCurrent(generation)) {
        disposeGltf(gltf);
        return;
      }

      this.gltf = gltf;
      this.scene.add(gltf.scene);
      this.fit(gltf.scene);
      if (gltf.animations.length > 0) {
        this.mixer = new AnimationMixer(gltf.scene);
        this.mixer.clipAction(gltf.animations[0]).play();
      }
      const statistics = sceneStatistics(gltf.scene);
      this.emit({
        phase: "ready",
        fileName: bundle.entry.file.name,
        format: bundle.entry.format,
        stability: bundle.entry.stability,
        animationCount: gltf.animations.length,
        objectCount: statistics.objects,
        triangleCount: statistics.triangles,
      });
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      this.clearAsset();
      this.emit({ phase: "error", message: errorMessage(error) });
    }
  }

  /**
   * Match the Desktop workbench's mounted-but-hidden tab lifecycle: retain the
   * parsed scene while inactive, but stop its animation frame and clock.
   */
  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (active) {
      this.clock.start();
      this.resize();
      this.renderer.setAnimationLoop(this.render);
    } else {
      this.renderer.setAnimationLoop(null);
      this.clock.stop();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.loadGeneration += 1;
    this.resizeObserver?.disconnect();
    this.clearAsset();
    this.controls.dispose();
    this.renderer.setAnimationLoop(null);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  readonly resize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly render = (): void => {
    if (!this.active || this.disposed) return;
    const delta = this.clock.getDelta();
    this.mixer?.update(delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private fit(root: Object3D): void {
    const bounds = new Box3().setFromObject(root);
    const center = new Vector3();
    const size = new Vector3();
    if (bounds.isEmpty()) {
      center.set(0, 0, 0);
      size.set(1, 1, 1);
    } else {
      bounds.getCenter(center);
      bounds.getSize(size);
    }
    const radius = Math.max(size.length() / 2, 0.5);
    const fov = MathUtils.degToRad(this.camera.fov);
    const distance = (radius / Math.sin(fov / 2)) * 1.15;
    const direction = new Vector3(1, 0.65, 1).normalize();

    this.camera.near = Math.max(radius / 100, 0.001);
    this.camera.far = Math.max(radius * 100, 100);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.minDistance = Math.max(radius / 50, 0.001);
    this.controls.maxDistance = Math.max(radius * 50, 10);
    this.controls.update();
  }

  private clearAsset(): void {
    if (this.mixer && this.gltf) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.gltf.scene);
    }
    this.mixer = null;
    if (this.gltf) {
      this.scene.remove(this.gltf.scene);
      disposeGltf(this.gltf);
      this.gltf = null;
      this.renderer.renderLists.dispose();
    }
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.loadGeneration;
  }

  private emit(status: LocalGltfPreviewController.Status): void {
    if (!this.disposed) this.onStatusChange(status);
  }
}

/**
 * Keep embedded image decoding on `<img src="blob:…">`, which is already
 * admitted by the Desktop `img-src` policy. Three otherwise selects
 * ImageBitmapLoader in Chromium and performs `fetch(blob:…)`, crossing the
 * deliberately narrower `connect-src` boundary.
 */
function localOnlyGltfLoader(): GLTFLoader {
  const manager = new LoadingManager();
  const loader = new GLTFLoader(manager);
  loader.register((parser) => {
    parser.textureLoader = new TextureLoader(manager);
    return { name: "GRIDA_local_texture_loader" };
  });
  return loader;
}

export namespace LocalGltfPreviewController {
  export type Options = Readonly<{
    active?: boolean;
    onStatusChange?: (status: Status) => void;
  }>;

  export type Status =
    | Readonly<{ phase: "idle" }>
    | Readonly<{ phase: "loading" }>
    | Readonly<{
        phase: "ready";
        fileName: string;
        format: LocalGltfBundle.Format;
        stability: LocalGltfBundle.Stability;
        animationCount: number;
        objectCount: number;
        triangleCount: number;
      }>
    | Readonly<{ phase: "error"; message: string }>;
}

function sceneStatistics(root: Object3D): Readonly<{
  objects: number;
  triangles: number;
}> {
  let objects = 0;
  let triangles = 0;
  root.traverse((object) => {
    objects += 1;
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry;
    const count =
      geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    triangles += count / 3;
  });
  return { objects, triangles: Math.floor(triangles) };
}

function disposeGltf(gltf: GLTF): void {
  const geometries = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<SkinnedMesh["skeleton"]>();
  for (const scene of gltf.scenes) {
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of objectMaterials) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof Texture) textures.add(value);
        }
      }
      if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
    });
  }
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The 3D asset could not be loaded.";
}
