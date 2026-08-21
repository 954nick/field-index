#!/usr/bin/env python3
# -------------------- FIELD INDEX CHARACTER VISUALS CODEC --------------------
from __future__ import annotations

import argparse
import ctypes
import ctypes.util
from pathlib import Path
import shutil
import sys


def _try_zstandard(mode: str, source: bytes, dictionary: bytes, level: int) -> bytes | None:
    try:
        import zstandard as zstd  # type: ignore
    except Exception:
        return None

    dict_data = zstd.ZstdCompressionDict(dictionary)
    if mode == "decompress":
        return zstd.ZstdDecompressor(dict_data=dict_data).decompress(source)
    return zstd.ZstdCompressor(level=level, dict_data=dict_data).compress(source)


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

            lib.ZSTD_createCCtx.restype = ctypes.c_void_p
            lib.ZSTD_freeCCtx.argtypes = [ctypes.c_void_p]
            lib.ZSTD_compressBound.argtypes = [ctypes.c_size_t]
            lib.ZSTD_compressBound.restype = ctypes.c_size_t
            lib.ZSTD_compress_usingDict.argtypes = [
                ctypes.c_void_p,
                ctypes.c_void_p,
                ctypes.c_size_t,
                ctypes.c_void_p,
                ctypes.c_size_t,
                ctypes.c_void_p,
                ctypes.c_size_t,
                ctypes.c_int,
            ]
            lib.ZSTD_compress_usingDict.restype = ctypes.c_size_t
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


def _ctypes_codec(mode: str, source: bytes, dictionary: bytes, level: int) -> tuple[bytes, str]:
    lib, provider = _load_zstd()
    if mode == "decompress":
        expected = int(lib.ZSTD_getFrameContentSize(source, len(source)))
        if expected in (0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFE):
            expected = 1024 * 1024
        destination = ctypes.create_string_buffer(expected)
        context = lib.ZSTD_createDCtx()
        if not context:
            raise RuntimeError("Could not create zstd decompression context")
        try:
            written = _check(lib, lib.ZSTD_decompress_usingDict(
                context,
                destination,
                expected,
                source,
                len(source),
                dictionary,
                len(dictionary),
            ))
        finally:
            lib.ZSTD_freeDCtx(context)
        return destination.raw[:written], provider

    capacity = int(lib.ZSTD_compressBound(len(source)))
    destination = ctypes.create_string_buffer(capacity)
    context = lib.ZSTD_createCCtx()
    if not context:
        raise RuntimeError("Could not create zstd compression context")
    try:
        written = _check(lib, lib.ZSTD_compress_usingDict(
            context,
            destination,
            capacity,
            source,
            len(source),
            dictionary,
            len(dictionary),
            level,
        ))
    finally:
        lib.ZSTD_freeCCtx(context)
    return destination.raw[:written], provider


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["compress", "decompress"])
    parser.add_argument("input")
    parser.add_argument("dictionary")
    parser.add_argument("output")
    parser.add_argument("--level", type=int, default=9)
    args = parser.parse_args()

    source = Path(args.input).read_bytes()
    dictionary = Path(args.dictionary).read_bytes()

    result = _try_zstandard(args.mode, source, dictionary, args.level)
    provider = "python-zstandard"
    if result is None:
        result, provider = _ctypes_codec(args.mode, source, dictionary, args.level)

    Path(args.output).write_bytes(result)
    print(f"{provider} | {args.mode} | {len(source)} -> {len(result)} bytes")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Field Index CharacterVisuals codec failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
