# Field Index

Field Index is a college football analytics and save-editing application built
around EA Sports College Football 27 Dynasty data.

## Current Status

The CFB27 read/edit backend is complete for the currently defined scope.
PostgreSQL now stores persistent dynasty history for teams, conferences,
players, coaches, schedules, game snapshots, box scores, player game stats,
line scores, and scoring-summary events.

The SQL analytics layer is also complete for the current scope. Curated
`analytics` views cover player/team/coach game, season, career, transfer, and
historical analysis, while a separate `bi` schema exposes flat dimensions and
facts for future Power BI work.

The next project phase is **asset extraction and mapping**. UI and Power BI
report construction remain later phases.

The backend can perform controlled save edits including players, coaches,
rankings, team grades, progression, appearances, and depth charts. Save editing
uses validation, backups/copies, reload, and parse verification.

## Current Architecture

CFB27 Dynasty Save  
→ JavaScript parser using `madden-franchise`  
→ clean Field Index backend data  
→ PostgreSQL persistent history / normalized facts  
→ SQL analytics + BI-ready views  
→ asset extraction/mapping *(next phase)*  
→ desktop UI *(later phase)*  
→ Power BI reports *(later phase)*  
→ packaged Windows application

Editing remains a separate controlled path:

Field Index edit request  
→ validation  
→ raw CFB27 record/reference update  
→ backup/copy  
→ save  
→ reload  
→ verify

PostgreSQL is analytics/history storage and does **not** automatically write
changes back into the dynasty save.

## Project Structure

```text
Field Index/
├── .gitignore
├── README.md
├── field_index.py
├── assets/
├── data/
├── database/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_core_football_schema.sql
│   │   ├── 003_people_storage.sql
│   │   ├── 004_analytics_friendly_snapshots.sql
│   │   ├── 005_game_storage.sql
│   │   └── 006_analytics_layer.sql
│   ├── queries/
│   │   └── analytics_examples.sql
│   ├── lib/
│   ├── .env.example
│   ├── migrate.js
│   ├── import_save.js
│   ├── verify.js
│   └── README.md
├── docs/
│   ├── analytics_layer.md
│   ├── database_erd.md
│   └── unique_table_ids.md
└── parser/
    ├── index.js
    ├── editor.js
    ├── coach_schema_compat.js
    ├── table_ids.js
    ├── package.json
    ├── package-lock.json
    └── schemas/
        └── C27_486_1.gz
```

## Parser Setup

From the `parser` directory:

```bash
npm ci
npm run check
```

To read a Dynasty save directly:

```bash
npm run read -- "C:\\path\\to\\DYNASTY-SAVE"
```

## PostgreSQL Setup

See [`database/README.md`](database/README.md) for architecture, migrations,
identity rules, import behavior, analytics views, and exact setup commands.

From the project root:

```bash
node database/migrate.js
node database/import_save.js "C:\\path\\to\\DYNASTY-SAVE" --dynasty-key my-dynasty --dynasty-name "My Dynasty"
node database/verify.js
```

Useful analytics examples are in:

```text
database/queries/analytics_examples.sql
```

## Schema Rule

Field Index uses only:

`parser/schemas/C27_486_1.gz`

Do not substitute or download another CFB27 schema for this project.
