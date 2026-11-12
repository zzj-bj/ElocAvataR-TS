import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = [
  { file: 'models/pose_landmarker_full.task', url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task' },
  { file: 'models/hand_landmarker.task', url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' },
  { file: 'avatar/sample.vrm', url: 'https://raw.githubusercontent.com/pixiv/three-vrm/v3.5.5/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm' },
];

for (const asset of assets) {
  const target = path.join(root, 'public', asset.file);
  await mkdir(path.dirname(target), { recursive: true });
  let bytes: Uint8Array;
  try {
    bytes = await readFile(target);
    if (bytes.byteLength < 1000) throw new Error('Incomplete asset');
    console.log(`Already present: ${asset.file}`);
  } catch {
    console.log(`Downloading ${asset.file}`);
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`${asset.file}: HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
    if (asset.file.endsWith('.vrm')) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid GLB/VRM download');
      const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
      const meta = json.extensions?.VRMC_vrm?.meta;
      if (!meta) throw new Error('Sample VRM metadata missing');
      console.log('Official sample attribution:', JSON.stringify(meta));
      await writeFile(path.join(root, 'public/avatar/sample-meta.json'), JSON.stringify(meta, null, 2) + '\n');
    } else if (bytes.byteLength < 100_000 || !Buffer.from(bytes.subarray(0, 16)).includes(Buffer.from('PK'))) {
      throw new Error('Invalid MediaPipe task bundle');
    }
    await writeFile(target, bytes);
  }
  console.log(`${asset.file}: ${bytes.byteLength} bytes, SHA256 ${createHash('sha256').update(bytes).digest('hex')}`);
}

const wasmSource = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmTarget = path.join(root, 'public/wasm');
await mkdir(wasmTarget, { recursive: true });
for (const name of await readdir(wasmSource)) {
  if (name.endsWith('.js') || name.endsWith('.wasm')) await copyFile(path.join(wasmSource, name), path.join(wasmTarget, name));
}
console.log('Ready. Runtime models and WASM are served locally; run npm run dev.');
