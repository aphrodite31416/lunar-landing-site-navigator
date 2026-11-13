# Lunar Landing Site Navigator

An interactive lunar south-pole landing site explorer, developed by **Team Outliers** for the **NASA International Space Apps Challenge 2026**.

## Overview

Lunar Landing Site Navigator helps users explore and compare potential landing sites near the Moon's south pole by analyzing terrain, sunlight conditions, and Earth communication visibility.

## Key Features

- **Interactive 3D Terrain:** Explore the lunar terrain around selected landing sites.
- **Sunlight & Shadow Analysis:** Analyze terrain-dependent illumination and shadow conditions.
- **Earth Visibility:** Identify potential direct-to-Earth communication windows.
- **Site Comparison:** Compare landing sites based on illumination and communication conditions.
- **Time-Based Exploration:** Visualize changing conditions across selected dates.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **3D Visualization:** Three.js / React Three Fiber
- **Scientific Computing:** Python, NumPy, SPICE
- **Data Sources:** NASA lunar terrain data and JPL ephemerides
- **Data Integration:** Precomputed JSON and terrain assets

## Project Structure

```text
├── frontend/       # Web application and visualizations
├── scientific/     # Scientific calculations and analysis
├── data/           # Processed datasets and terrain assets
└── docs/           # Documentation and references
```

## Scientific pipeline

The local scientific module now loads the four supplied site ephemerides,
validates horizon-v2 handoffs, exports JSON, and searches landing dates under
mission constraints. Terrain-aware results require the four original horizon
profiles; body positions and historical aggregates can be generated before they
arrive. The frontend directory currently contains the TypeScript data contract.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m scientific build --mission data/mission.example.json
.venv/bin/python -m scientific sync-frontend
```

See [scientific integration and validation](docs/scientific-integration.md),
[team architecture and contributor boundaries](docs/team-architecture.md),
[the frontend JSON contract](docs/data-contract.md), and the preserved
[mathematical foundations](scientific/README.md).

## Team

**Outliers** — NASA Space Apps Challenge 2026
