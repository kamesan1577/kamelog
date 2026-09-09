import { readFile } from "node:fs/promises";

const assets = [
  "public/favicon.png",
  "public/kamelog-header-mark.png",
  "public/kamelog-logo.png",
];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

for (const asset of assets) {
  const bytes = await readFile(asset);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`${asset} is not a valid PNG`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error(`${asset} has invalid dimensions`);
  }
  console.log(`${asset}: ${width}x${height}, ${bytes.length} bytes`);
}
