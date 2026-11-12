import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { VRMHumanBoneName, type VRM } from '@pixiv/three-vrm';
import { valid, type Landmark, type MotionFrame, type Side } from './motion.ts';

type BoneName = (typeof VRMHumanBoneName)[keyof typeof VRMHumanBoneName];
interface RestBone {
  node: Object3D;
  local: Quaternion;
  world: Quaternion;
  position: Vector3;
}

export const toAvatar = (p: Landmark): Vector3 => new Vector3(p.x, -p.y, -p.z);

/** Orthonormal frame; reject collapsed or collinear measurements instead of emitting NaNs. */
export function basis(across: Vector3, up: Vector3): Quaternion | undefined {
  if (across.lengthSq() < 1e-8 || up.lengthSq() < 1e-8) return;
  const x = across.clone().normalize();
  const z = new Vector3().crossVectors(x, up);
  if (z.lengthSq() < 1e-8) return;
  z.normalize();
  const y = new Vector3().crossVectors(z, x).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

/** All inputs are numbers. Camera images never enter the VRM rig. */
export class AvatarRig {
  private rest = new Map<BoneName, RestBone>();
  private touched = new Set<BoneName>();
  private bodyBasis = new Quaternion();
  private palmBases: Partial<Record<Side, Quaternion>> = {};
  private alpha = 1;

  constructor(vrm: VRM) {
    vrm.humanoid.resetNormalizedPose();
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    for (const name of Object.values(VRMHumanBoneName)) {
      const node = vrm.humanoid.getNormalizedBoneNode(name);
      if (node) this.rest.set(name, {
        node, local: node.quaternion.clone(), world: node.getWorldQuaternion(new Quaternion()),
        position: node.getWorldPosition(new Vector3()),
      });
    }
    const ls = this.rest.get('leftUpperArm')?.position;
    const rs = this.rest.get('rightUpperArm')?.position;
    const hips = this.rest.get('hips')?.position;
    if (ls && rs && hips) this.bodyBasis = basis(ls.clone().sub(rs), ls.clone().add(rs).multiplyScalar(0.5).sub(hips)) ?? new Quaternion();
    for (const side of ['left', 'right'] as const) {
      const wrist = this.rest.get(`${side}Hand`)?.position;
      const index = this.rest.get(`${side}IndexProximal`)?.position;
      const little = this.rest.get(`${side}LittleProximal`)?.position;
      const middle = this.rest.get(`${side}MiddleProximal`)?.position;
      if (wrist && index && little && middle) this.palmBases[side] = basis(index.clone().sub(little), middle.clone().sub(wrist));
    }
  }

  private setLocal(name: BoneName, target: Quaternion): void {
    const rest = this.rest.get(name);
    if (!rest || !target.toArray().every(Number.isFinite)) return;
    this.touched.add(name);
    rest.node.quaternion.slerp(target, this.alpha);
    rest.node.updateWorldMatrix(true, true);
  }

  private worldRotation(name: BoneName, delta: Quaternion): void {
    const rest = this.rest.get(name);
    if (!rest) return;
    const parent = rest.node.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    this.setLocal(name, parent.invert().multiply(delta).multiply(rest.world));
  }

  private direction(name: BoneName, child: BoneName, direction: Vector3): void {
    const rest = this.rest.get(name);
    const end = this.rest.get(child);
    if (!rest || !end || direction.lengthSq() < 1e-8) return;
    // Work in the CURRENT parent's coordinates, so elbows/fingers do not rotate twice.
    const parentWorld = rest.node.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    const boneAxis = end.position.clone().sub(rest.position).applyQuaternion(rest.world.clone().invert()).normalize();
    const restDirection = boneAxis.applyQuaternion(rest.local);
    const target = direction.clone().normalize().applyQuaternion(parentWorld.invert());
    this.setLocal(name, new Quaternion().setFromUnitVectors(restDirection, target).multiply(rest.local));
  }

  apply(motion: MotionFrame, dt: number, smoothing: number, threshold: number): void {
    this.alpha = smoothing <= 0 ? 1 : 1 - Math.exp(-dt / smoothing);
    this.touched.clear();
    const points = motion.world;
    const p = (i: number): Vector3 | undefined => valid(points[i], threshold) ? toAvatar(points[i]) : undefined;
    const ls = p(11), rs = p(12), lh = p(23), rh = p(24);
    if (ls && rs && lh && rh) {
      const up = ls.clone().add(rs).sub(lh).sub(rh);
      const upper = basis(ls.clone().sub(rs), up);
      const lower = basis(lh.clone().sub(rh), up);
      if (upper && lower) {
        const inverse = this.bodyBasis.clone().invert();
        this.worldRotation('hips', lower.clone().multiply(inverse));
        this.worldRotation('spine', lower.clone().slerp(upper, 0.5).multiply(inverse));
        this.worldRotation('chest', upper.clone().multiply(inverse));
        this.worldRotation('upperChest', upper.clone().multiply(inverse));
      }
    }
    const earL = p(7), earR = p(8), nose = p(0);
    if (earL && earR && nose) {
      const across = earL.clone().sub(earR);
      const forward = nose.clone().sub(earL.clone().add(earR).multiplyScalar(0.5));
      const orientation = basis(across, new Vector3().crossVectors(forward, across));
      if (orientation) this.worldRotation('head', orientation.multiply(this.bodyBasis.clone().invert()));
    }
    for (const side of ['left', 'right'] as const) {
      const offset = side === 'left' ? 0 : 1;
      const segments = [
        [`${side}UpperArm`, `${side}LowerArm`, 11 + offset, 13 + offset],
        [`${side}LowerArm`, `${side}Hand`, 13 + offset, 15 + offset],
        [`${side}UpperLeg`, `${side}LowerLeg`, 23 + offset, 25 + offset],
        [`${side}LowerLeg`, `${side}Foot`, 25 + offset, 27 + offset],
        [`${side}Foot`, `${side}Toes`, 27 + offset, 31 + offset],
      ] as const;
      for (const [bone, child, a, b] of segments) {
        const start = p(a), end = p(b);
        if (start && end) this.direction(bone, child, end.sub(start));
      }
      const hand = motion.hands[side];
      if (!hand || !p(15 + offset) || hand.world.length !== 21 || !hand.world.every(v => valid(v))) continue;
      const h = hand.world.map(toAvatar);
      const palm = basis(h[5].clone().sub(h[17]), h[9].clone().sub(h[0]));
      const restPalm = this.palmBases[side];
      if (palm && restPalm) this.worldRotation(`${side}Hand`, palm.multiply(restPalm.clone().invert()));
      const fingers = [
        ['Thumb', ['Metacarpal', 'Proximal', 'Distal'], 1],
        ['Index', ['Proximal', 'Intermediate', 'Distal'], 5],
        ['Middle', ['Proximal', 'Intermediate', 'Distal'], 9],
        ['Ring', ['Proximal', 'Intermediate', 'Distal'], 13],
        ['Little', ['Proximal', 'Intermediate', 'Distal'], 17],
      ] as const;
      for (const [finger, joints, first] of fingers) {
        for (let j = 0; j < 3; j++) {
          const name = `${side}${finger}${joints[j]}` as BoneName;
          const next = j < 2 ? `${side}${finger}${joints[j + 1]}` as BoneName : undefined;
          if (next) this.direction(name, next, h[first + j + 1].clone().sub(h[first + j]));
          else {
            // VRM has no humanoid fingertip bone. Carry the measured distal bend
            // relative to the preceding phalanx, preserving the model's local axis.
            const rest = this.rest.get(name);
            const previous = this.rest.get(`${side}${finger}${joints[1]}` as BoneName);
            if (!rest || !previous) continue;
            const axis = rest.position.clone().sub(previous.position).applyQuaternion(previous.world.clone().invert()).normalize();
            const parentWorld = rest.node.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
            const target = h[first + 3].clone().sub(h[first + 2]).normalize().applyQuaternion(parentWorld.invert());
            this.setLocal(name, new Quaternion().setFromUnitVectors(axis, target).multiply(rest.local));
          }
        }
      }
    }
    // Return lost/occluded joints to rest. Never freeze an old gesture indefinitely.
    for (const [name, rest] of this.rest) if (!this.touched.has(name)) {
      rest.node.quaternion.slerp(rest.local, this.alpha);
      rest.node.updateWorldMatrix(true, false);
    }
  }
}
