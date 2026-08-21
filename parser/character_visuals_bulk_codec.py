#!/usr/bin/env python3
# -------------------- FIELD INDEX CHARACTER VISUALS BULK CODEC --------------------
from __future__ import annotations

import argparse
import ctypes
import ctypes.util
from pathlib import Path
import shutil
import struct
import sys


def _read_bundle(path: Path) -> list[bytes]:
    data = path.read_bytes()
    if len(data) < 4:
        raise RuntimeError("Bulk CharacterVisuals bundle is truncated")
    count = struct.unpack_from("<I", data, 0)[0]
    offset = 4
    frames: list[bytes] = []
    for _ in range(count):
        if offset + 4 > len(data):
            raise RuntimeError("Bulk CharacterVisuals bundle length table is truncated")
        length = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        end = offset + length
        if end > len(data):
            raise RuntimeError("Bulk CharacterVisuals frame is truncated")
        frames.append(data[offset:end])
        offset = end
    if offset != len(data):
        raise RuntimeError("Bulk CharacterVisuals bundle has trailing bytes")
    return frames


def _write_bundle(path: Path, frames: list[bytes]) -> None:
    chunks = [struct.pack("<I", len(frames))]
    for frame in frames:
        chunks.append(struct.pack("<I", len(frame)))
        chunks.append(frame)
    path.write_bytes(b"".join(chunks))


def _try_zstandard(frames: list[bytes], dictionary: bytes) -> tuple[list[bytes], str] | None:
    try:
        import zstandard as zstd  # type: ignore
    except Exception:
        return None

    dict_data = zstd.ZstdCompressionDict(dictionary)
    decoder = zstd.ZstdDecompressor(dict_data=dict_data)
    return [decoder.decompress(frame) for frame in frames], "python-zstandard"


def _candidate_zstd_libraries():
    candidates: list[str] = []
    found = ctypes.util.find_library("zstd")
    if found:
        candidates.append(found)

    if sys.platform.startswith("win"):
        git_exe = shutil.which("git")
        if git_exe:
            git = Path(git_exe)
            roots = [git.parent, git.parent.parent, git.parent.parent.parent]
            for root in roots:
                for name in ("libzstd.dll", "libzstd-1.dll", "zstd.dll"):
                    candidates.extend([
                        str(root / "mingw64" / "bin" / name),
                        str(root / "bin" / name),
                    ])
    else:
        candidates.extend([
            "/lib/x86_64-linux-gnu/libzstd.so.1",
            "/usr/lib/x86_64-linux-gnu/libzstd.so.1",
            "/usr/lib64/libzstd.so.1",
        ])

    seen = set()
    for candidate in candidates:
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        yield candidate


def _load_zstd():
    failures = []
    for candidate in _candidate_zstd_libraries():
        try:
            lib = ctypes.CDLL(candidate)
            lib.ZSTD_isError.argtypes = [ctypes.c_size_t]
            lib.ZSTD_isError.restype = ctypes.c_uint
            lib.ZSTD_getErrorName.argtypes = [ctypes.c_size_t]
            lib.ZSTD_getErrorName.restype = ctypes.c_char_p
            lib.ZSTD_getFrameContentSize.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
            lib.ZSTD_getFrameContentSize.restype = ctypes.c_ulonglong
            lib.ZSTD_createDCtx.restype = ctypes.c_void_p
            lib.ZSTD_freeDCtx.argtypes = [ctypes.c_void_p]
            lib.ZSTD_decompress_usingDict.argtypes = [
                ctypes.c_void_p,
                ctypes.c_void_p,
                ctypes.c_size_t,
                ctypes.c_void_p,
                ctypes.c_size_t,
                ctypes.c_void_p,
                ctypes.c_size_t,
            ]
            lib.ZSTD_decompress_usingDict.restype = ctypes.c_size_t
            return lib, candidate
        except Exception as exc:
            failures.append(f"{candidate}: {exc}")

    raise RuntimeError(
        "No usable zstd implementation was found. Install the Python package zstandard "
        "with `py -3 -m pip install zstandard`, or make libzstd available. "
        + (" | ".join(failures) if failures else "")
    )


def _check(lib, result: int) -> int:
    if lib.ZSTD_isError(result):
        raise RuntimeError(lib.ZSTD_getErrorName(result).decode("utf-8", errors="replace"))
    return result


def _ctypes_decompress(frames: list[bytes], dictionary: bytes) -> tuple[list[bytes], str]:
    lib, provider = _load_zstd()
    context = lib.ZSTD_createDCtx()
    if not context:
        raise RuntimeError("Could not create zstd decompression context")

    output: list[bytes] = []
    try:
        for frame in frames:
            expected = int(lib.ZSTD_getFrameContentSize(frame, len(frame)))
            if expected in (0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFE):
                expected = 1024 * 1024
            destination = ctypes.create_string_buffer(expected)
            written = _check(lib, lib.ZSTD_decompress_usingDict(
                context,
                destination,
                expected,
                frame,
                len(frame),
                dictionary,
                len(dictionary),
            ))
            output.append(destination.raw[:written])
    finally:
        lib.ZSTD_freeDCtx(context)
    return output, provider


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("dictionary")
    parser.add_argument("output")
    args = parser.parse_args()

    frames = _read_bundle(Path(args.input))
    dictionary = Path(args.dictionary).read_bytes()

    decoded = _try_zstandard(frames, dictionary)
    if decoded is None:
        output, provider = _ctypes_decompress(frames, dictionary)
    else:
        output, provider = decoded

    _write_bundle(Path(args.output), output)
    print(f"{provider} | bulk-decompress | {len(frames)} frame(s)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Field Index bulk CharacterVisuals codec failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
