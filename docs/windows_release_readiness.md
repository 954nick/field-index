# Windows Release Readiness

## Already release-oriented

- single canonical CFB27 schema
- no alternate-schema fallback
- production service boundary under `backend/`
- raw game assets excluded from Git
- lightweight mapping/index format
- short save-name generator
- automatic backup requirement on source overwrite
- staged edits and rollback
- safe FBCHUNKS writer
- source compression-profile gate
- parser reopen verification
- PostgreSQL migrations and verification
- automated backend/parser tests

## Development-only dependencies still to remove for release

The final installer must not require the user to install:

- Git for Windows
- Python
- npm
- Node.js separately
- PostgreSQL command-line tooling separately if a local embedded/managed database
  strategy replaces the current developer PostgreSQL installation

## Compression runtime

During development, `classic_zlib_compress.py` discovers a compatible classic
zlib implementation and the writer verifies it by reproducing the untouched EA
source stream byte-for-byte before any mutation is written.

For release, ship a known-compatible compression runtime with Field Index and
invoke it directly. Keep the same source-stream equivalence gate even after the
runtime is bundled.

## Packaging order

1. finish backend implementation
2. complete database migrations on the real local database
3. populate Head ID/portrait mappings
4. pass automated tests
5. pass in-game regression matrix
6. finish desktop UI against `backend/`
7. build Power BI dashboards against prepared `bi` views
8. select/bundle release runtimes
9. package Windows application
10. test on a clean Windows machine without dev tools

Packaging before the in-game regression matrix would make writer debugging harder
and is intentionally deferred.
