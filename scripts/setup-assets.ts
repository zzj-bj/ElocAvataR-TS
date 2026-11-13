import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = [
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
    }
    await writeFile(target, bytes);
  }
  console.log(`${asset.file}: ${bytes.byteLength} bytes, SHA256 ${createHash('sha256').update(bytes).digest('hex')}`);
}

const holisticSource = path.join(root, 'node_modules/@mediapipe/holistic');
const holisticTarget = path.join(root, 'public/holistic');
await mkdir(holisticTarget, { recursive: true });
for (const name of await readdir(holisticSource)) {
  if (/\.(js|wasm|data|binarypb)$/.test(name) || name === 'pose_landmark_full.tflite') {
    if (name === 'holistic.js') {
      const source = await readFile(path.join(holisticSource, name), 'utf8');
      const marker = 'a.i.GL.makeContextCurrent(f);';
      const contextOption = 'ua:"undefined"!==typeof WebGL2RenderingContext?2:1';
      if (source.split(marker).length !== 2) throw new Error('Pinned Holistic worker compatibility patch no longer matches. Review the runtime before upgrading.');
      if (source.split(contextOption).length !== 2) throw new Error('Pinned Holistic WebGL option patch no longer matches.');
      // Legacy 0.5 initializes K (the texture-upload WebGL context) only on its DOM path.
      // Initialize the same field on its existing OffscreenCanvas worker path as well.
      // The same worker path mangles Emscripten's public `majorVersion` option to `ua`.
      await writeFile(path.join(holisticTarget, name), source.replace(contextOption, 'majorVersion:2').replace(marker, `${marker}a.K=a.i.GL.currentContext.GLctx;`));
    } else await copyFile(path.join(holisticSource, name), path.join(holisticTarget, name));
  }
}
console.log('Ready. Holistic scripts, packed models, graph, and WASM are served locally. No .task files or runtime CDN are used.');
