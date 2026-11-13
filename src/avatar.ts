import {
  AmbientLight, Box3, Color, DirectionalLight, GridHelper, HemisphereLight,
  PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { AvatarRig } from './rig.ts';
import { emptyMotion, type MotionFrame } from './motion.ts';
import { solveFace } from './face.ts';

export class AvatarStage {
  readonly renderer = new WebGLRenderer({ antialias: true, alpha: false });
  private scene = new Scene();
  private camera = new PerspectiveCamera(32, 1, 0.01, 100);
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private vrm?: VRM;
  private rig?: AvatarRig;
  private height = 1.7;
  private center = new Vector3(0, 0.85, 0);
  private generation = 0;
  private focus: 'body' | 'left' | 'right' = 'body';
  private disposed = false;
  private resizeRaf = 0;

  constructor(host: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D VRM avatar');
    host.append(this.renderer.domElement);
    this.scene.background = new Color('#111e28');
    this.scene.add(new HemisphereLight(0xe2f5ff, 0x555b6b, 2.5), new AmbientLight(0xffffff, 0.6));
    const key = new DirectionalLight(0xffffff, 3);
    key.position.set(2, 3, 4);
    this.scene.add(key);
    const rim = new DirectionalLight(0x72dec5, 2);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim, new GridHelper(10, 40, 0x35525d, 0x20333f));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.08;
    this.controls.maxDistance = 15;
    this.controls.maxPolarAngle = Math.PI * 0.95;
    this.resetView();
    this.observer = new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeRaf);
      this.resizeRaf = requestAnimationFrame(() => {
        const width = host.clientWidth, height = host.clientHeight;
        if (!width || !height || this.disposed) return;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
      });
    });
    this.observer.observe(host);
  }

  async load(url: string): Promise<boolean> {
    const generation = ++this.generation;
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm?.humanoid) {
      VRMUtils.deepDispose(gltf.scene);
      throw new Error('This file has no valid VRM humanoid rig. Import a VRM 0.x or 1.0 model.');
    }
    if (generation !== this.generation || this.disposed) {
      VRMUtils.deepDispose(vrm.scene);
      return false;
    }
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(vrm.scene);
    const size = box.getSize(new Vector3());
    if (!Number.isFinite(size.y) || size.y < 0.001) {
      VRMUtils.deepDispose(vrm.scene);
      throw new Error('The VRM model has invalid dimensions.');
    }
    vrm.scene.position.y -= box.min.y;
    vrm.scene.traverse(object => { object.frustumCulled = false; });
    vrm.update(0);
    const rig = new AvatarRig(vrm);
    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    this.vrm = vrm;
    this.rig = rig;
    this.scene.add(vrm.scene);
    this.height = size.y;
    this.center.copy(box.getCenter(new Vector3()));
    this.center.y -= box.min.y;
    this.resetView();
    return true;
  }

  setFocus(focus: 'body' | 'left' | 'right'): void {
    this.focus = focus;
    if (focus === 'body') this.resetView();
    else {
      const bone = this.vrm?.humanoid.getRawBoneNode(`${focus}Hand`);
      if (!bone) return;
      const center = bone.getWorldPosition(new Vector3());
      this.controls.target.copy(center);
      this.camera.position.copy(center).add(new Vector3(0, 0.05, this.height * 0.32));
      this.controls.update();
    }
  }

  resetView(): void {
    this.focus = 'body';
    this.controls.target.copy(this.center);
    this.camera.position.copy(this.center).add(new Vector3(0, this.height * 0.03, this.height * 2.15));
    this.controls.update();
  }

  render(motion: MotionFrame, dt: number, smoothing: number, threshold: number): void {
    this.rig?.apply(motion, dt, smoothing, threshold);
    const expressions = solveFace(motion.face, motion.aspect);
    const manager = this.vrm?.expressionManager;
    const alpha = smoothing <= 0 ? 1 : 1 - Math.exp(-dt / smoothing);
    for (const name of ['blinkLeft', 'blinkRight', 'aa'] as const) {
      const current = manager?.getValue(name) ?? 0;
      manager?.setValue(name, current + (expressions[name] - current) * alpha);
    }
    this.vrm?.update(dt);
    if (this.focus !== 'body') {
      const hand = this.vrm?.humanoid.getRawBoneNode(`${this.focus}Hand`);
      if (hand) {
        const delta = hand.getWorldPosition(new Vector3()).sub(this.controls.target);
        this.controls.target.add(delta);
        this.camera.position.add(delta);
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resetPose(): void {
    this.vrm?.humanoid.resetNormalizedPose();
    this.vrm?.update(0);
    this.rig?.apply(emptyMotion(), 1, 0, 0.5);
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.observer.disconnect();
    cancelAnimationFrame(this.resizeRaf);
    this.controls.dispose();
    VRMUtils.deepDispose(this.scene);
    this.renderer.dispose();
  }
}
