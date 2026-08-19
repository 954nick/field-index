# Field Index

Field Index is a college football analytics and save-editing application built around EA Sports College Football 27 Dynasty data.

## Current Status

**Backend v0.3.3 is complete for the current v1.0 scope.**

The backend can read structured dynasty data and perform controlled save edits including players, coaches, rankings, team grades, progression, appearances, and depth charts. Save editing uses validation, backups/copies, reload, and parse verification.

The next development phase is **SQL / Data Storage**, followed by asset mapping, analytics/Power BI, desktop UI integration, and packaging.

## Current Architecture

CFB27 Dynasty Save  
→ JavaScript parser using `madden-franchise`  
→ clean Field Index backend data  
→ SQL database *(next phase)*  
→ analytics / Power BI  
→ desktop UI  
→ packaged Windows application

Editing remains a separate controlled path:

Field Index edit request  
→ validation  
→ raw CFB27 record/reference update  
→ backup/copy  
→ save  
→ reload  
→ verify

## Project Structure

```text
Field Index/
├── .gitignore
├── README.md
├── field_index.py
├── assets/
├── data/
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
npm install
npm run check
```

To read a Dynasty save directly:

```bash
npm run read -- "C:\\path\\to\\DYNASTY-SAVE"
```

## Schema Rule

Field Index uses only:

`parser/schemas/C27_486_1.gz`

Do not substitute or download another CFB27 schema for this project.
