// Writes a true 1-bit greyscale PNG (bit depth 1, colour type 0), so the file
// can only contain black and white. Each source pixel becomes an N×N block.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function zlib(raw) {
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// bits: Uint8Array, 1 = black ink, 0 = white paper.
export async function encodePNG1(bits, w, h, scale = 1) {
  const W = w * scale, H = h * scale;
  const stride = Math.ceil(W / 8) + 1; // +1 for the filter byte at the start of each row
  const raw = new Uint8Array(stride * H);
  for (let y = 0; y < H; y++) {
    const src = Math.floor(y / scale) * w;
    const row = y * stride; // filter byte stays 0 (None)
    for (let x = 0; x < W; x++) {
      // In 1-bit greyscale, a set bit is white.
      if (!bits[src + Math.floor(x / scale)]) raw[row + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, W);
  v.setUint32(4, H);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [signature, chunk('IHDR', ihdr), chunk('IDAT', await zlib(raw)), chunk('IEND', new Uint8Array())];
  return new Blob(parts, { type: 'image/png' });
}

// Fallback for browsers without CompressionStream: an RGBA PNG that still holds only two colours.
function canvasPNG(bits, w, h, scale) {
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const v = bits[Math.floor(y / scale) * w + Math.floor(x / scale)] ? 0 : 255;
      const j = (y * c.width + x) * 4;
      img.data[j] = img.data[j + 1] = img.data[j + 2] = v;
      img.data[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

export async function exportPNG(bits, w, h, scale, filename) {
  const blob = typeof CompressionStream === 'function'
    ? await encodePNG1(bits, w, h, scale)
    : await canvasPNG(bits, w, h, scale);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { bytes: blob.size, width: w * scale, height: h * scale };
}
