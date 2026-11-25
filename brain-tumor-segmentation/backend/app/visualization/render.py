"""Slice rendering (numpy + Pillow only). Orientation follows the radiological convention:
axial: patient right on image left, anterior at top; coronal/sagittal: superior at top."""
import io

import numpy as np
from PIL import Image, ImageDraw

PLANES = ("axial", "coronal", "sagittal")
COLORS = {1: (229, 72, 77), 2: (63, 182, 139), 3: (245, 197, 66)}   # necrotic, edema, enhancing
MAGENTA = (217, 70, 239)
TARGET = 512
_AXIS = {"axial": 2, "coronal": 1, "sagittal": 0}


def plane_count(shape, plane):
    return int(shape[_AXIS[plane]])


def plane_slice(vol, plane, index):
    if plane == "axial":
        return vol[:, :, index]
    if plane == "coronal":
        return vol[:, index, :]
    return vol[index, :, :]


def plane_zoom(zooms, plane):
    zx, zy, zz = zooms
    return {"axial": (zx, zy), "coronal": (zx, zz), "sagittal": (zy, zz)}[plane]


def orient(a, plane):
    a = np.swapaxes(a, 0, 1)
    return a if plane == "axial" else a[::-1]


def display_size(shape2d, zoom):
    w, h = shape2d[0] * zoom[0], shape2d[1] * zoom[1]
    s = TARGET / max(w, h)
    return max(1, round(w * s)), max(1, round(h * s))


def gray_image(vol, plane, index, zooms):
    sl = plane_slice(vol, plane, index)
    size = display_size(sl.shape, plane_zoom(zooms, plane))
    return Image.fromarray(np.ascontiguousarray(orient(sl, plane)), "L").resize(size, Image.BILINEAR)


def mask_image(lab, plane, index, zooms, labels=(1, 2, 3), style="region"):
    sl = plane_slice(lab, plane, index)
    rgba = np.zeros(sl.shape + (4,), np.uint8)
    for k in labels:
        m = sl == k
        rgba[m, :3] = MAGENTA if style == "single" else COLORS[k]
        rgba[m, 3] = 255
    size = display_size(sl.shape, plane_zoom(zooms, plane))
    return Image.fromarray(np.ascontiguousarray(orient(rgba, plane)), "RGBA").resize(size, Image.NEAREST)


def composite(gray, mask, opacity):
    base = gray.convert("RGBA")
    m = np.array(mask)
    m[..., 3] = (m[..., 3].astype(np.float32) * float(opacity)).astype(np.uint8)
    return Image.alpha_composite(base, Image.fromarray(m, "RGBA"))


def to_png(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)
    return buf.getvalue()


def montage(disp, lab, zooms, indices, opacity=0.5, style="region"):
    """One PNG with the three planes side by side, tumor overlaid (the downloadable overlay)."""
    panels = []
    for plane in PLANES:
        i = indices[plane]
        img = composite(gray_image(disp, plane, i, zooms), mask_image(lab, plane, i, zooms, style=style), opacity)
        d = ImageDraw.Draw(img)
        d.text((8, 6), f"{plane.capitalize()}  {i + 1}/{plane_count(lab.shape, plane)}", fill=(255, 255, 255, 255))
        panels.append(img)
    h = max(p.height for p in panels)
    w = sum(p.width for p in panels) + 8 * (len(panels) - 1)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    x = 0
    for p in panels:
        canvas.paste(p, (x, (h - p.height) // 2))
        x += p.width + 8
    return canvas.convert("RGB")
