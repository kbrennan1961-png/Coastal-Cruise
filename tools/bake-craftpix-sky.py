#!/usr/bin/env python3
"""Bake the CraftPix sky/background pack into js/GeneratedAssets.js.

The source PNGs are only needed at bake time. This writes three composited
576x324 data URIs (day, golden hour and night) into the embedded texture table
so the game still runs from file:// with no fetch calls.
"""
import base64
import json
import os
import struct
import sys
import zlib
import zipfile

DEFAULT_ZIP = os.path.expanduser(
    "~/Downloads/craftpix-net-558275-free-sky-with-clouds-background-pixel-art-set.zip")
DEFAULT_TARGET = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "js", "GeneratedAssets.js")

COMBOS = {
    "craftSkyDay": ("Clouds 5", [("4.png", 0.82), ("5.png", 0.62)]),
    "craftSkyGolden": ("Clouds 7", [("4.png", 0.78), ("3.png", 0.55)]),
    "craftSkyNight": ("Clouds 3", [("3.png", 0.72), ("4.png", 0.7)]),
}


def read_png(data):
    pos = 8
    idat = b""
    width = height = color_type = None
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, _, color_type, _, _, _ = struct.unpack(">IIBBBBB", chunk)
        elif kind == b"IDAT":
            idat += chunk
        elif kind == b"IEND":
            break
    channels = {2: 3, 6: 4, 0: 1, 4: 2}[color_type]
    raw = zlib.decompress(idat)
    stride = width * channels
    rows = []
    previous = bytearray(stride)
    offset = 0
    for _ in range(height):
        filter_type = raw[offset]
        offset += 1
        row = bytearray(raw[offset:offset + stride])
        offset += stride
        for x in range(stride):
            a = row[x - channels] if x >= channels else 0
            b = previous[x]
            c = previous[x - channels] if x >= channels else 0
            if filter_type == 1:
                row[x] = (row[x] + a) & 255
            elif filter_type == 2:
                row[x] = (row[x] + b) & 255
            elif filter_type == 3:
                row[x] = (row[x] + ((a + b) // 2)) & 255
            elif filter_type == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                predictor = a if pa <= pb and pa <= pc else b if pb <= pc else c
                row[x] = (row[x] + predictor) & 255
        rows.append(bytes(row))
        previous = row
    return width, height, channels, rows


def write_png(width, height, pixels):
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, _ in row:
            raw += bytes((r, g, b))

    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data +
                struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff))

    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
            chunk(b"IEND", b""))


def composite(zf, set_name, layers):
    width, height, channels, background = read_png(
        zf.read("Clouds/%s/1.png" % set_name))
    rgba = [[list(row[i:i + 3]) + [255] for i in range(0, len(row), channels)]
            for row in background]
    for filename, opacity in layers:
        _, _, layer_channels, rows = read_png(
            zf.read("Clouds/%s/%s" % (set_name, filename)))
        for y in range(height):
            row = rows[y]
            for x in range(width):
                offset = x * layer_channels
                alpha = (row[offset + 3] if layer_channels == 4 else 255)
                alpha = alpha / 255.0 * opacity
                if alpha <= 0:
                    continue
                dst = rgba[y][x]
                src = row[offset:offset + 3]
                for c in range(3):
                    dst[c] = round(dst[c] * (1 - alpha) + src[c] * alpha)
    return write_png(width, height, rgba)


def update_generated_assets(target, textures):
    source = open(target, "r").read()
    start = source.index("CC.GeneratedAssets = { textures: ") + len("CC.GeneratedAssets = { textures: ")
    end = source.index(",\n    models:", start)
    table = json.loads(source[start:end])
    table.update(textures)
    replacement = json.dumps(table, separators=(",", ":"))
    open(target, "w").write(source[:start] + replacement + source[end:])


def main():
    zip_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ZIP
    target = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_TARGET
    textures = {}
    with zipfile.ZipFile(zip_path) as zf:
        for key, (set_name, layers) in COMBOS.items():
            png = composite(zf, set_name, layers)
            textures[key] = "data:image/png;base64," + base64.b64encode(png).decode()
            print("%s: %d bytes" % (key, len(png)))
    update_generated_assets(target, textures)
    print("updated", target)


if __name__ == "__main__":
    main()
