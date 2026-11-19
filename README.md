# HeatShield AI

**HeatShield AI is a site-coordinator decision-support tool that turns live heat conditions and shift rosters into compliant, safer work-rest schedules, without collecting or exposing individual worker health data.**

Built for the **Future Health Digital Innovation Challenge 2026** (*Population Health — Climate-Resilient Worker Health*).

---

## Problem

Outdoor workers on UAE construction and industrial sites face severe seasonal thermal stress between morning ramp-up and peak afternoon sun. Generic consumer weather apps show only ambient air temperature—ignoring humidity, solar radiation, wind cooling, physical workload, crew shift rosters, and mandatory regulatory midday-break windows. Meanwhile, occupational monitoring systems that collect worker biometrics or individual symptom histories risk privacy intrusion, surveillance creep, and punitive misuse.

---

## Solution

HeatShield AI bridges live meteorological forecasts, deterministic UAE regulatory compliance rules, and anonymized crew-level AI planning into a practical site-coordinator workflow (plus a simple multi-language crew view in English, Arabic RTL, Hindi, and Urdu):

1. **Live Environmental Data (`dataService` + `wbgtCalculator`)**:
   - Fetches real-time temperature, relative humidity, wind speed, solar radiation, UV index, and hourly forecasts from the free **Open-Meteo API** (no key required) for UAE presets (**Dubai, Abu Dhabi, Sharjah, Al Ain**) or custom site coordinates, with **10-minute automatic refresh**.
   - Computes **estimated WBGT** and **estimated Heat Index** per hour and per crew exposure (`sun` / `shade` / `indoor`), always labeled explicitly as `estimated`.
   - Supports optional **On-Site Meter** overrides (`Air Temp`, `Humidity`, optional calibrated `Meter WBGT`) switching the source badge cleanly between **`Regional forecast`** and **`Site-measured`**.
   - Degrades gracefully on network failure with a visible **Data Stale / Offline** status and cached last-updated timestamp.

2. **Deterministic UAE Compliance Engine (`complianceEngine` + `complianceConfig.ts`)**:
   - Rule-based, non-AI engine enforcing the **UAE MOHRE Midday Break Rule** (`12:30 PM – 3:00 PM`, `15 June – 15 September` for direct-sun outdoor work), shaded rest areas, drinking water, and cooling provisions.
   - Evaluates every hourly shift block as **`Compliant`**, **`At risk`**, or **`Violation`** with the exact rule name that triggered it, computes hourly **Rest-Area Occupancy vs. Shelter Capacity** and **First-Aider Coverage**, and flags **Dangerous Working Conditions**.
   - Centralizes all thresholds in one editable file (`src/config/complianceConfig.ts`) with a visible reminder to **verify against the latest official MOHRE / OSHAD guidance before operational use**.

3. **Anonymized Shift Roster & Generative AI Planner (`rosterParser` + `aiPlanner`)**:
   - Accepts CSV upload, pasted text, or demo data restricted strictly to anonymized crew fields: `crew_id`, `taskType`, `workload`, `exposure`, `shiftStart`, `shiftEnd`, and optional `crewTag` (`new_to_site` / `returning_after_leave` / `acclimatized`). Any extra personal columns (names, ages, medical fields) are automatically stripped on ingest.
   - Sends **only** hourly weather, anonymized crew rows, rest-area capacity, first-aider count, and compliance rules to server-side **Google Gemini** (`POST /api/gemini/schedule-plan`).
   - Runs every Gemini output through `complianceEngine`: any rule-violating AI draft is **auto-rejected** with an explicit reason and replaced by a guaranteed-compliant deterministic schedule, stamped **`Validated by compliance engine`**.
   - Supports **Proactive 3-Hour Look-Ahead Re-Planning** (generating a coordinator review banner with a *"What changed & why"* diff when escalation is forecast), inline block edits, **Approve / Reject**, WhatsApp brief copy, CSV export, print-friendly PDF layout, and English/Arabic voice alerts.

4. **Extended Site-Coordinator & Worker Operational Workflow (Zero PII)**:
   - **Dynamic Triggers & 3-Hour Look-Ahead (`TriggerAndTrustBanner`)**: Maps effective estimated WBGT and MOHRE hours into **`Green / Advisory / Restrict / Stop work`** action levels, recommended mitigation lists, and proactive warnings before threshold crossings.
   - **Data Quality, Trust & Explainability**: Displays live / forecast / stale confidence tags, switches automatically to conservative safety defaults when offline/stale, and includes an expandable **Explainability** panel showing every input and rule used.
   - **Acclimatization Planner (Crew-Level)**: Tags crews as `New to Site`, `Returning After Leave`, or `Acclimatized` and uses Gemini (`POST /api/gemini/acclimatization-plan`) + deterministic fallback to build a gradual multi-day exposure ramp marked *"General guidance, verify with your HSE officer."*
   - **Site Readiness Checklist & Printable PDF Report**: 6 pre-shift compliance checks (shaded rest area, chilled water & electrolytes, cooling stations, first-aider on duty, emergency contacts `998`, shift briefing) feeding directly into site readiness % and exporting a clean printable Daily Compliance Report PDF without any personal data.
   - **Hydration & Rest-Break Reminder Engine**: Auto-calculates break cadence and water volumes (`ml`) from workload + WBGT, broadcasting via on-screen banners, voice alerts, and copyable WhatsApp/SMS briefs in **EN / AR / HI / UR** with a crew-level `sent / acknowledged` audit log.
   - **Equipment & Work-Zone Context**: Applies transparent crew-zone offsets (`Open Ground`, `Rooftop`, `Trench`, `Confined Space`, `Near Machinery`, `Indoor/Shaded`), flags high-risk combinations with suggested alternatives, and surfaces optional `Dark PPE` and `Reflective Surfaces` factors explicitly in the formula note.
   - **What-If Simulator**: Interactive sliders for temperature, humidity, shift hour, workload, rest minutes, zone, and PPE with live compliance status checks and concise Gemini trade-off explanations (`POST /api/gemini/whatif-tradeoff`).
   - **Anonymous Incident & Near-Miss Log (`GET/POST /api/incidents`)**: Records site-level time, zone, environmental conditions, and preventive action (zero names/medical fields), highlights recurring peak hour/zone patterns, and states *"For site learning only. Not for disciplinary use."*
   - **Worker-Facing Simple Read-Only View (`WorkerSimpleCardPanel`)**: Zero-login, large-text icon card showing crew rest/water times, current risk level, shade locations, EN/AR/HI/UR voice playback, printable gate QR poster, and stop-and-report warning signs card.
   - **Rest Station QR & Shady Area Registry (`ShadeStationQrCard`)**: Printable rest-station QR posters allowing zero-typing crew shade check-ins.
   - **Multi-Site Portfolio Comparison**: Aggregated dashboard comparing **Dubai, Abu Dhabi, Sharjah, and Al Ain**, ranked by sites needing attention first.
   - **Audit Trail & AI Governance**: Logs AI Suggestion, Compliance Engine Verdict, and Human Coordinator Decision (`Approved`, `Edited`, `Rejected / Replaced`), requiring human schedule approval before sending crew voice or WhatsApp broadcasts.
   - **Offline-Friendly PWA (`vite-plugin-pwa`)**: Installable web app caching the last approved schedule, UAE compliance rules, and assets, labeling offline outputs clearly as *"based on last update at [time]"*.
   - **Judges' Impact Metrics Panel**: Operational demo indicators (rest minutes added, heavy work moved out of peak heat, midday-ban compliance %, alerts acknowledged) explicitly marked as operational schedule indicators, not clinical health outcome claims.

5. **Clear Boundary Between Environmental Guidance and Medical Intervention**:
   - Persistent notice: *"Automated environmental guidance only. Not a medical diagnosis or treatment."*
   - Dedicated **Emergency & First Aid Escalation** card listing general heat-illness warning signs and instructing crews to stop work, move to shade/AC, cool down, and contact site medic or **UAE Ambulance `998`**.

---

## Architecture

```text
├── server.ts                         # Express backend + Open-Meteo proxy + server-side Gemini schedule/acclim/whatif/TTS + shade & incident endpoints
├── vite.config.ts                    # Vite + VitePWA manifest & Workbox offline runtime cache
├── src/
│   ├── config/
│   │   └── complianceConfig.ts       # Single editable file for UAE compliance thresholds, triggers, zones & rules
│   ├── services/
│   │   ├── dataService.ts            # Open-Meteo fetch, site presets, stale/offline cache & site-only storage
│   │   ├── wbgtCalculator.ts         # Estimated WBGT (Stull wet-bulb + globe radiation) & Heat Index
│   │   ├── complianceEngine.ts       # Deterministic UAE rule engine & fallback schedule generator
│   │   ├── coordinatorEngines.ts     # Acclimatization, readiness, hydration cadence, triggers, zone modifiers, what-if, incidents, portfolio & metrics
│   │   ├── shadeRegistryService.ts   # Rest Station QR URL & zero-typing shade bay check-in registry
│   │   ├── rosterParser.ts           # Strict crew-only CSV parser stripping personal fields
│   │   ├── aiPlanner.ts              # Gemini planner client + compliance guardrail validator + diff engine
│   │   ├── auditLog.ts               # Coordinator AI-to-human governance audit helper
│   │   ├── alertService.ts           # WhatsApp brief formatter, CSV export, voice broadcast alerts
│   │   ├── i18n.ts                   # EN / AR (RTL) dashboard + EN / AR / HI / UR worker labels
│   │   └── __tests__/sanityChecks.ts # Automated sanity checks for wbgtCalculator, complianceEngine, auditLog & privacy
│   ├── hooks/
│   │   └── usePWAInstall.ts          # PWA install prompt & online/offline status hooks
│   ├── components/
│   │   ├── coordinator/              # TriggerAndTrustBanner, HSEOperationsSuite, RosterIntakeBar, ShiftTimelineGrid, SideGuidancePanel, ShadeStationQrCard
│   │   ├── WorkerSimpleCardPanel.tsx # No-login, large-text icon card & gate QR poster for crews
│   │   ├── PWAInstallButton.tsx      # Install App button & Offline/Stale banner
│   │   ├── VoiceQaModal.tsx          # Bilingual Voice Safety Q&A
│   │   └── TeamPage.tsx              # /team route
│   └── App.tsx                       # Site-coordinator, offline cache & AI governance workflow state
```

---

## Privacy & Data Minimization

HeatShield AI is architected so **no individual worker data can enter, persist, or leave the browser**:
- **Zero Individual Profiles**: No login accounts, worker names, ages, Emirates IDs, phone numbers, or wearable biometrics.
- **Zero Individual Health Inputs**: No personal symptom checklists, medical histories, diagnoses, or individual fatigue scores. Acclimatization tags (`new_to_site`, `returning_after_leave`), rest-bay QR check-ins, and hydration acknowledgements operate strictly at the **crew_id / site level**.
- **Ingestion Guardrail**: `rosterParser` drops any columns outside the anonymous crew-level fields (`crew_id`, `taskType`, `workload`, `exposure`, `shiftStart`, `shiftEnd`, optional `crewTag`), and backend `/api/incidents` & `/api/shade-registry` routes accept only whitelisted anonymous site/crew fields.
- **Session & Local Storage**: `localStorage` caches only site-level settings, coordinates, editable thresholds, anonymous crew rows, readiness checklist state, offline weather timestamps, and the last approved crew schedule.
- **Anti-Misuse Notice**: *"This tool must not be used for individual performance evaluation or disciplinary action."* and *"For site learning only. Not for disciplinary use."*

---

## Limitations

- **Meteorological Estimates, Not On-Site Globe Thermometry**: Estimated WBGT and Heat Index are derived mathematically from Open-Meteo regional forecasts (air temperature, humidity, wind speed, shortwave radiation) rather than calibrated on-site black-globe hardware sensors. Microclimates near reflective steel, asphalt, or enclosed scaffolding can run hotter.
- **Regulatory Reference Disclaimer**: Thresholds and seasonal hours reflect general UAE summer rules and are stored in `src/config/complianceConfig.ts` for coordinator review. Coordinators must **verify against the latest official MOHRE / OSHAD guidance before operational use**.
- **Not a Medical Tool**: Provides automated environmental scheduling guidance only—not clinical triage, diagnosis, or medical treatment.

---

## Running & Verification

```bash
npm install
npm run test:sanity   # Run 17 deterministic wbgtCalculator, complianceEngine, auditLog & privacy checks
npm run lint          # TypeScript check
npm run build         # Production bundle & service worker
npm run dev           # Full-stack Express + Vite server on port 3000
```

Required environment variable in `.env` (server-side only):
```env
GEMINI_API_KEY=your_key_here
```

---

## Future Work

1. **On-Site Calibrated IoT Microclimate Sensors**: Pair regional Open-Meteo forecasts with calibrated site wet-bulb/black-globe (WBGT) stations via MQTT/REST gateways for zone-accurate radiant heat verification.
2. **Official WBGT & National Weather Station Feeds**: Integrate directly with UAE National Center of Meteorology (NCM) and municipal heat telemetry feeds.
3. **Shift & Site Attendance System Integration**: Connect read-only crew counts and zone assignments from enterprise ERP/site access systems while preserving anonymous crew-level aggregation and zero worker-level health telemetry.
