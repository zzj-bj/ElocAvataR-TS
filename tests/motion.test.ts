import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Object3D, Quaternion, Vector3 } from 'three';
import { type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { associateHands, emptyMotion, valid, type Landmark } from '../src/motion.ts';
import { AvatarRig, basis, toAvatar } from '../src/rig.ts';
import { demoMotion } from '../src/demo.ts';

const handAt = (x: number, y: number): Landmark[] => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
const poseAt = (): Landmark[] => {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  points[15] = { x: 0.8, y: 0.5, z: 0, visibility: 1 };
  points[16] = { x: 0.2, y: 0.5, z: 0, visibility: 1 };
  return points;
};

test('hands follow anatomical pose wrists regardless of detector output ordering', () => {
  const left = handAt(0.8, 0.5), right = handAt(0.2, 0.5);
  for (const images of [[right, left], [left, right]]) {
    const result = associateHands(poseAt(), images, images);
    assert.equal(result.left?.image, left);
    assert.equal(result.right?.image, right);
  }
});

test('hand matching is one-to-one, maximizes count, and rejects distant/invalid points', () => {
  const pose = poseAt();
  pose[15].x = 0.5; pose[16].x = 0.65;
  const a = handAt(0.52, 0.5), b = handAt(0.3, 0.5);
  const result = associateHands(pose, [a, b], [a, b]);
  assert.equal(result.left?.image, b);
  assert.equal(result.right?.image, a);
  assert.deepEqual(associateHands(poseAt(), [handAt(4, 4)], [a]), {});
  a[5].x = NaN;
  assert.deepEqual(associateHands(poseAt(), [a], [a]), {});
  assert.deepEqual(associateHands([], [b], [b]), {});
});

test('coordinate transform retains depth and rejects degenerate body frames', () => {
  assert.deepEqual(toAvatar({ x: 1, y: 2, z: 3 }).toArray(), [1, -2, -3]);
  assert.equal(valid({ x: NaN, y: 0, z: 0 }), false);
  assert.equal(valid({ x: 0, y: 0, z: 0, visibility: 0.2 }, 0.5), false);
  assert.equal(basis(new Vector3(), new Vector3(0, 1, 0)), undefined);
  assert.equal(basis(new Vector3(1, 0, 0), new Vector3(1, 0, 0)), undefined);
  const frame = basis(new Vector3(1, 0, 0), new Vector3(0, 1, 0))!;
  assert.ok(frame.angleTo(new Quaternion()) < 1e-8);
});

function fakeAvatar(): { vrm: VRM; bones: Map<string, Bone> } {
  const scene = new Object3D();
  const bones = new Map<string, Bone>();
  const add = (name: string, parent: string | undefined, x: number, y: number, z = 0) => {
    const bone = new Bone(); bone.name = name; bone.position.set(x, y, z);
    (parent ? bones.get(parent)! : scene).add(bone); bones.set(name, bone);
  };
  add('hips', undefined, 0, 1);
  add('spine', 'hips', 0, 0.15); add('chest', 'spine', 0, 0.2);
  add('head', 'chest', 0, 0.3);
  for (const [side, sign] of [['left', 1], ['right', -1]] as const) {
    add(`${side}UpperArm`, 'chest', sign * 0.2, 0.1);
    add(`${side}LowerArm`, `${side}UpperArm`, sign * 0.3, 0);
    add(`${side}Hand`, `${side}LowerArm`, sign * 0.25, 0);
    for (const [index, finger] of ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].entries()) {
      const joints = finger === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
      add(`${side}${finger}${joints[0]}`, `${side}Hand`, sign * 0.05, (index - 2) * 0.02);
      add(`${side}${finger}${joints[1]}`, `${side}${finger}${joints[0]}`, sign * 0.025, 0);
      add(`${side}${finger}${joints[2]}`, `${side}${finger}${joints[1]}`, sign * 0.02, 0);
    }
    add(`${side}UpperLeg`, 'hips', sign * 0.1, -0.05);
    add(`${side}LowerLeg`, `${side}UpperLeg`, 0, -0.4);
    add(`${side}Foot`, `${side}LowerLeg`, 0, -0.4);
    add(`${side}Toes`, `${side}Foot`, 0, -0.05, 0.1);
  }
  scene.updateMatrixWorld(true);
  const vrm = {
    scene,
    humanoid: {
      getNormalizedBoneNode: (name: VRMHumanBoneName) => bones.get(name) ?? null,
      resetNormalizedPose: () => { for (const bone of bones.values()) bone.quaternion.identity(); },
    },
    update: () => scene.updateMatrixWorld(true),
  } as unknown as VRM;
  return { vrm, bones };
}

test('VRM rig moves real hierarchical bones, independently animates fingers, and clears stale poses', () => {
  const { vrm, bones } = fakeAvatar();
  const rig = new AvatarRig(vrm);
  const motion = demoMotion(0.4);
  rig.apply(motion, 1 / 30, 0, 0.5);
  assert.ok(bones.get('leftUpperArm')!.quaternion.angleTo(new Quaternion()) > 0.1);
  const index = bones.get('leftIndexIntermediate')!.quaternion.clone();
  const little = bones.get('leftLittleIntermediate')!.quaternion.clone();
  assert.ok(index.angleTo(little) > 0.01, 'different fingers must not share one curl');
  for (const bone of bones.values()) assert.ok(bone.quaternion.toArray().every(Number.isFinite));
  const broken = demoMotion(0.5);
  broken.hands.left!.world[5].x = NaN;
  rig.apply(broken, 1 / 30, 0, 0.5);
  assert.ok(bones.get('leftIndexIntermediate')!.quaternion.angleTo(new Quaternion()) < 1e-8);
  rig.apply(emptyMotion(), 1, 0, 0.5);
  for (const bone of bones.values()) assert.ok(bone.quaternion.angleTo(new Quaternion()) < 1e-7, bone.name);
});

test('smoothing converges with time rather than depending on the render frame rate', () => {
  const run = (fps: number) => {
    const { vrm, bones } = fakeAvatar();
    const rig = new AvatarRig(vrm);
    const motion = demoMotion(0.3);
    for (let i = 0; i < fps; i++) rig.apply(motion, 1 / fps, 0.1, 0.5);
    return bones.get('leftUpperArm')!.quaternion;
  };
  assert.ok(run(30).angleTo(run(120)) < 0.002);
});
