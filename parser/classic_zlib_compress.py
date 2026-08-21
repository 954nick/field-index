#!/usr/bin/env python3
# -------------------- FIELD INDEX CLASSIC ZLIB HELPER --------------------
from __future__ import annotations

import argparse
import ctypes
import ctypes.util
import os
from pathlib import Path
import shutil
import sys
import zlib

Z_OK = 0
DEFAULT_LEVEL = 6


def _dedupe(items):
    seen = set()
    output = []
    for item in items:
        key = str(item).lower()
        if key not in seen:
            seen.add(key)
            output.append(item)
    return output


def discover_library_candidates():
    candidates = []

    configured = os.environ.get("FIELD_INDEX_ZLIB_DLL", "").strip()
    if configured:
        candidates.append(Path(configured))

    if os.name == "nt":
        git_exe = shutil.which("git")
        if git_exe:
            git_path = Path(git_exe)
            possible_roots = [
                git_path.parent,
                git_path.parent.parent,
                git_path.parent.parent.parent,
            ]
            for root in possible_roots:
                candidates.extend([
                    root / "mingw64" / "bin" / "zlib1.dll",
                    root / "mingw64" / "libexec" / "git-core" / "zlib1.dll",
                    root / "bin" / "zlib1.dll",
                ])

        for env_name in ("ProgramFiles", "ProgramW6432", "LOCALAPPDATA"):
            base = os.environ.get(env_name)
            if not base:
                continue
            base_path = Path(base)
            roots = [base_path / "Git"]
            if env_name == "LOCALAPPDATA":
                roots.append(base_path / "Programs" / "Git")
            for root in roots:
                candidates.extend([
                    root / "mingw64" / "bin" / "zlib1.dll",
                    root / "mingw64" / "libexec" / "git-core" / "zlib1.dll",
                ])
    else:
        found = ctypes.util.find_library("z")
        if found:
            candidates.append(found)
        candidates.extend([
            "/usr/lib/x86_64-linux-gnu/libz.so.1",
            "/lib/x86_64-linux-gnu/libz.so.1",
            "/usr/lib64/libz.so.1",
        ])

    return _dedupe(candidates)


def load_classic_zlib():
    failures = []
    for candidate in discover_library_candidates():
        try:
            if isinstance(candidate, Path):
                if not candidate.is_file():
                    continue
                library_name = str(candidate)
            else:
                library_name = str(candidate)

            lib = ctypes.CDLL(library_name)

            lib.zlibVersion.argtypes = []
            lib.zlibVersion.restype = ctypes.c_char_p
            version_raw = lib.zlibVersion()
            version = version_raw.decode("ascii", errors="replace") if version_raw else "unknown"

            lib.compressBound.argtypes = [ctypes.c_ulong]
            lib.compressBound.restype = ctypes.c_ulong

            lib.compress2.argtypes = [
                ctypes.POINTER(ctypes.c_ubyte),
                ctypes.POINTER(ctypes.c_ulong),
                ctypes.POINTER(ctypes.c_ubyte),
                ctypes.c_ulong,
                ctypes.c_int,
            ]
            lib.compress2.restype = ctypes.c_int

            return lib, library_name, version
        except Exception as exc:
            failures.append(f"{candidate}: {exc}")

    detail = " | ".join(failures) if failures else "no candidate zlib library was found"
    raise RuntimeError(
        "Could not load a classic zlib library. Field Index looked for the zlib1.dll "
        "that ships with Git for Windows. "
        f"Details: {detail}"
    )


def compress_with_library(data: bytes, level: int):
    lib, library_name, version = load_classic_zlib()

    source_len = len(data)
    bound = int(lib.compressBound(source_len))
    destination = (ctypes.c_ubyte * bound)()
    destination_len = ctypes.c_ulong(bound)

    if source_len:
        source = (ctypes.c_ubyte * source_len).from_buffer_copy(data)
    else:
        source = (ctypes.c_ubyte * 1)()

    result = lib.compress2(
        destination,
        ctypes.byref(destination_len),
        source,
        source_len,
        level,
    )
    if result != Z_OK:
        raise RuntimeError(f"zlib compress2 failed with status {result}")

    compressed = bytes(destination[: destination_len.value])

    # Python's inflate implementation may be zlib-ng; that is fine here because
    # it is only an independent decompression integrity check.
    if zlib.decompress(compressed) != data:
        raise RuntimeError("classic zlib output failed the independent inflate check")

    return compressed, library_name, version


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?")
    parser.add_argument("output", nargs="?")
    parser.add_argument("--level", type=int, default=DEFAULT_LEVEL)
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()

    if not 0 <= args.level <= 9:
        parser.error("--level must be between 0 and 9")

    if args.probe:
        _, library_name, version = load_classic_zlib()
        print(f"classic-zlib library={library_name} version={version}")
        return 0

    if not args.input or not args.output:
        parser.error("input and output are required unless --probe is used")

    data = Path(args.input).read_bytes()
    compressed, library_name, version = compress_with_library(data, args.level)
    Path(args.output).write_bytes(compressed)
    print(
        f"classic-zlib library={library_name} version={version} "
        f"level={args.level} {len(data)} -> {len(compressed)} bytes"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Field Index classic-zlib helper failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
