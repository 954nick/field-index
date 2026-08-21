# Field Index v1.0.0

**Field Index** is a desktop analytics and save-management platform for **EA SPORTS College Football 27 Dynasty Mode**.

The project combines save-file parsing, safe editing, historical data storage, analytics, and automated validation into one backend designed for a future desktop UI and Power BI reporting layer.

Field Index is built as both a practical dynasty utility and a portfolio project demonstrating software engineering, data engineering, database design, analytics, testing, and application architecture.

---

## Project Status

### Backend v1.0.0 — Complete

The core Field Index backend is implemented and release-gated.

Current automated verification:

- 63 root/backend tests
- 23 parser tests
- 86 total automated tests
- 186/186 backend release-gate checks
- 0 backend audit warnings
- 0 backend audit failures

Core editing systems have also been verified against College Football 27 saves in-game.

### Still In Development

- Final desktop UI
- Power BI dashboards
- Self-contained Windows runtime
- Windows installer/distribution
- Clean-machine release testing

---

## Core Features

### Dynasty Save Parsing

Field Index loads College Football 27 Dynasty saves using the canonical CFB27 schema and exposes structured data through a production backend service layer.

Supported data includes:

- Players
- Teams
- Coaches
- Depth charts
- Schedules
- Game results
- Player game statistics
- Season statistics
- Career statistics
- Recruiting
- Transfer history
- Rankings
- Awards
- Coach talent trees
- College Football Playoff data
- Historical dynasty snapshots

---

## Player Editing

Field Index supports validated editing of player data including:

- Ratings
- Jersey numbers
- Position
- Height
- Weight
- Class
- Redshirt status
- Skill points
- Experience points
- Player abilities
- Appearance fields
- Head IDs
- Batch player edits

Redshirt edits include consistency warnings when a player is marked ineligible despite appearing in four or fewer games.

---

## Head ID System

Field Index includes a complete local CFB27 Head ID catalog.

Current catalog:

- 13,481 usable Head profiles
- Generic and unique heads
- 30,210 mapped portrait IDs

Supported Head swaps include:

- Generic → Unique
- Unique → Generic
- Generic → Generic
- Unique → Unique
- Multiple Head changes within one save

Head swaps preserve unrelated player equipment and body data.

---

## Depth Chart Editing

Depth charts can be read and safely modified through the backend.

Field Index supports:

- Viewing position groups
- Reordering players
- Moving players within depth-chart positions
- Validated multi-player depth-chart changes

---

## Coach Editing

Coach support includes:

- Coach information
- Coach points
- Experience points
- Appearance
- Staff assignments
- Talent trees
- Talent nodes
- Unlock states
- Purchasable states
- Owned abilities
- Points spent

All 13 CFB27 coach talent trees are modeled.

Field Index also preserves the distinction between base talent trees and advanced archetypes such as **Motivator** and **Master Motivator** instead of treating them as interchangeable labels.

---

## Rankings and College Football Playoff

Field Index supports:

- Media/AP rankings
- Coaches rankings
- CFP rankings
- Historical ranking snapshots
- CFP bracket reconstruction
- Postseason history

### CFP Editing

First-round CFP editing uses an atomic consistency model.

A bracket change synchronizes the required ranking, seed, matchup, and linked bracket state together rather than modifying a single field in isolation.

The production implementation supports safe permutations of teams already selected for the first-round field.

Completed CFP games remain protected from participant editing.

---

## Team and My School Data

Field Index reads team information and My School grades.

Stadium Atmosphere editing uses the game-verified authoritative My School field rather than the non-authoritative program-points value.

Additional team data includes:

- Team ratings
- Schedule
- Recruiting information
- Historical team snapshots
- Rankings
- Analytics metrics
- Program and My School data

---

## Recruiting and Transfers

Supported recruiting data includes:

- Prospects
- Recruiting boards
- Offers
- School interest
- Commitments
- Signing classes
- Recruiting class rankings
- Historical recruiting snapshots

Transfer data supports historical player movement across seasons and dynasties.

---

## Game and Statistical Data

Field Index extracts and normalizes:

- Passing
- Rushing
- Receiving
- Defense
- Offensive line
- Kicking
- Punting
- Kick returns
- Punt returns
- Fumbles

Game support includes:

- Final scores
- Quarter and overtime scoring
- Team box scores
- Player box scores
- Schedules
- Historical games
- Scoring summaries

Authoritative final scores come from game score fields rather than being reconstructed from scoring-summary events.

---

## Database and Historical Tracking

Field Index uses PostgreSQL for persistent dynasty history.

The data model is designed for:

- Multiple dynasties
- Multiple seasons
- Repeated save imports
- Player careers
- Coach careers
- Team history
- Transfers
- Recruiting history
- Rankings history
- Award history
- Depth-chart history
- Coach talent history
- Game history

Database migrations are versioned and automatically verified during the import workflow.

Current migration sequence:

- 001 — Initial schema
- 002 — Core football schema
- 003 — People storage
- 004 — Analytics-friendly snapshots
- 005 — Game storage
- 006 — Analytics layer
- 007 — Extended dynasty history
- 008 — Recruiting class rankings
- 009 — Coach talent history

---

## Analytics Layer

Field Index includes dedicated PostgreSQL schemas for analytics and Power BI consumption.

The backend prepares reusable views for:

- Player seasons
- Player careers
- Team seasons
- Team games
- Player games
- Coach seasons
- Coach careers
- Rankings
- Transfers
- Recruiting
- Historical dynasty data

The final Power BI dashboards are intentionally being developed after the backend and data model are stable.

---

## Save Safety

Editing is designed around strict save-file safety.

Protections include:

- Staged edits
- Pending-change review
- Undo/reset support
- Automatic backups before source overwrite
- Save-as-copy support
- Short safe output filenames
- Source compression-profile validation
- FBCHUNKS preservation
- Unknown-tail preservation
- Compression equivalence checks
- Reopen validation after writing
- Invalid-value rejection
- Completed CFP game protection

Field Index does not weaken save-integrity protections simply to force an edit to succeed.

---

## Architecture

```text
Field Index
│
├── assets/
│   └── mappings/
│
├── backend/
│   ├── editing/
│   ├── lib/
│   ├── services/
│   └── tests/
│
├── data/
│
├── database/
│   ├── lib/
│   ├── migrations/
│   └── queries/
│
├── docs/
│
├── packaging/
│
├── parser/
│   ├── schemas/
│   └── tests/
│
├── scripts/
│
└── tests/