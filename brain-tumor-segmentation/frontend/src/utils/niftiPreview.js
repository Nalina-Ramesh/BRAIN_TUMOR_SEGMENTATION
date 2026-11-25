// Browser-side NIfTI-1 preview: reads the header and draws the middle axial slice.
// Only used for the upload preview; the backend does its own full validation.
const ARRAYS = { 2: Uint8Array, 4: Int16Array, 8: Int32Array, 16: Float32Array, 64: Float64Array, 256: Int8Array, 512: Uint16Array, 768: Uint32Array };

export const isNiftiName = (name) => /\.(nii|nii\.gz)$/i.test(name || "");
export const UNSUPPORTED_MESSAGE = "Unsupported file format. Please upload an MRI scan in .nii or .nii.gz format only.";

async function readBytes(file) {
  if (!/\.nii\.gz$/i.test(file.name)) return file.arrayBuffer();
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot preview .nii.gz files (the upload still works).");
  return new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

/** Returns { width, height, depth, rgba } for the middle axial slice. Throws if the header is not NIfTI-1. */
export async function previewNifti(file) {
  const buf = await readBytes(file);
  if (buf.byteLength < 352) throw new Error("The file is too small to be a NIfTI image.");
  const v = new DataView(buf);
  if (v.getInt32(0, true) !== 348) throw new Error("Not a little-endian NIfTI-1 file, so no preview is available.");
  const magic = String.fromCharCode(v.getUint8(344), v.getUint8(345), v.getUint8(346));
  if (magic !== "n+1" && magic !== "ni1") throw new Error("The file content is not a NIfTI-1 image.");
  const ndim = v.getInt16(40, true);
  const [nx, ny, nz] = [v.getInt16(42, true), v.getInt16(44, true), v.getInt16(46, true)];
  if (ndim < 3 || nx < 1 || ny < 1 || nz < 1) throw new Error("This is not a 3D volume.");
  const Type = ARRAYS[v.getInt16(70, true)];
  if (!Type) throw new Error("Unsupported voxel data type.");
  const offset = Math.round(v.getFloat32(108, true)) || 352;
  let slope = v.getFloat32(112, true), inter = v.getFloat32(116, true);
  if (!slope) slope = 1;
  if (!inter) inter = 0;
  const k = Math.floor(nz / 2), n = nx * ny, bytes = Type.BYTES_PER_ELEMENT;
  if (offset + (k + 1) * n * bytes > buf.byteLength) throw new Error("The file is truncated.");
  const vals = new Type(buf.slice(offset + k * n * bytes, offset + (k + 1) * n * bytes));
  // contrast window from non-zero voxels
  const nonzero = [];
  for (let i = 0; i < n; i += 7) if (vals[i] !== 0) nonzero.push(vals[i] * slope + inter);
  nonzero.sort((a, b) => a - b);
  const lo = nonzero.length ? nonzero[Math.floor(nonzero.length * 0.01)] : 0;
  const hi = nonzero.length ? nonzero[Math.floor(nonzero.length * 0.995)] : 1;
  const rgba = new Uint8ClampedArray(n * 4);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const raw = vals[i + j * nx];
      const g = raw === 0 ? 0 : Math.max(0, Math.min(255, ((raw * slope + inter - lo) / Math.max(hi - lo, 1e-6)) * 255));
      const p = (j * nx + i) * 4;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = g;
      rgba[p + 3] = 255;
    }
  return { width: nx, height: ny, depth: nz, rgba };
}

export const formatBytes = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
