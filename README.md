# HeatShield AI

**Privacy-first occupational heat-risk early-warning, hydration tracking, and SmartShift scheduling platform for outdoor workers and delivery riders in Dubai & the UAE.**

Built around **ISO 7243 (WBGT)** thermal standards and **UAE Ministry of Human Resources and Emiratisation (MoHRE)** Midday Break regulations (`12:30–15:00`), HeatShield AI combines a deterministic physiological rule engine with server-side **Google Gemini** reasoning, bilingual (**English & Arabic**) voice Q&A, live microphone transcription, and interactive site planning.

---

## Key Features

### 1. Deterministic WBGT & Heat-Risk Engine
- Calculates **Wet-Bulb Globe Temperature (WBGT)** from ambient air temperature, relative humidity, solar globe radiant temperature, and sun exposure (`full`, `partial`, `shade`).
- Adjusts thresholds dynamically for **workload** (`Light`, `Moderate`, `Heavy`, `Very Heavy`), **heavy PPE**, **acclimatization / 14-day new-worker protocol**, **continuous exposure hours**, **self-reported symptoms**, and active **UAE MoHRE Midday Break** hours.
- Includes a **"Why This Alert?"** mathematical transparency drawer breaking down every risk driver and threshold adjustment.
- Rule-engine safety guardrail ensures AI explanations may advise raising caution, never lowering a deterministic risk classification.

### 2. Three Role-Specific Workspaces (with Guest Entry)
- **Landing Experience**: Animated flying-card hero & overview with direct **Continue as Guest** access into any role.
- **Worker View**:
  - Live risk card, bilingual audio readout, and 6-language safety alerts (`EN`, `AR`, `HI`, `ML`, `KN`, `UR`).
  - **Smart Hydration Tracker**: Risk-adaptive daily targets (`2,500–5,000 ml`) and reminder cadences (`45m` Low, `30m` Moderate, `20m` High, `15m` Critical/Midday Ban), one-tap `+250 ml Cup`, `+500 ml Bottle`, `+Electrolyte`, and `Undo` controls, quarter-milestone progress bar, on-time & multi-day hydration streak tracking, and a celebratory particle burst & chime when the daily goal is met.
  - Work/rest countdown timer, **Buddy Check** teammate check-in, acclimatization status toggle, early heat-strain symptom self-reporting with emergency medic dispatch modal, and an anonymized on-device privacy ledger.
- **Rider View**:
  - Shared **Hydration Tracker** synced across role switches.
  - **Cool-By Routing**: Estimates minutes remaining before WBGT escalates into High/Critical bands.
  - **Certified Cooling Stations Radar & List**: Computes Haversine distance and estimated motorcycle travel time to Dubai cooling hubs (Downtown, Business Bay, Al Barsha, Deira, Dubai Marina, Al Quoz), pins the nearest emergency refuge during High/Critical heat, and launches Google Maps directions.
- **Supervisor View**:
  - Dubai district heat risk overview, rolling WBGT trend, and **Open-Meteo** hourly Dubai forecast integration (`GET /api/weather-forecast` with automatic fallback).
  - **SmartShift Planner**: Generates heat-aware crew schedules (`Crew A`, `Crew B`, `Crew C`) via Gemini while strictly enforcing the `12:30–15:00` mandatory air-conditioned midday rest window.
  - Alert lead-time & useful/false-alarm feedback logging.

### 3. Bilingual Voice Safety Q&A & Transcription (EN / AR)
- **Live Microphone Capture**: Uses `navigator.mediaDevices.getUserMedia` + `MediaRecorder` alongside a live `AudioContext` 7-bar audio level visualizer and optional Web Speech interim captions.
- **Accurate Server-Side Transcription**: Sends recorded clips to `POST /api/gemini/transcribe` (powered by `gemini-3.5-transcribe` with model fallbacks) to transcribe spoken **English** and **Arabic** accurately.
- **Spoken Answers**: Replies in both English and clear UAE Arabic (`POST /api/gemini/voice-qa`) and plays natural audio via Gemini TTS (`POST /api/gemini/tts`) with automatic browser `SpeechSynthesis` fallback.

### 4. Hardware Sensor Proxy & Heat-Wave Demo Simulator
- **Live Sensor Mode**: Polls an ESP32 or REST JSON sensor endpoint (`{ "t": 38.4, "rh": 52, "globe": 45.4 }`) via CORS-safe `GET /api/sensor-proxy`, gracefully falling back to simulated mode if unreachable.
- **Demo Controls Drawer**: Simulate air temp, humidity, sun exposure, workload, PPE, Midday Ban, or trigger a **60-Second Heat-Wave Scenario Ramp**.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Motion (`motion/react`), Lucide Icons (`lucide-react`)
- **Backend**: Node.js, Express 4 (`server.ts` via `tsx`)
- **AI & Speech**: `@google/genai` (server-side Gemini API for heat advice, SmartShift planning, bilingual Q&A, TTS, and audio transcription)
- **Weather Data**: Open-Meteo Forecast API (`Asia/Dubai`) with deterministic offline fallback

---

## Getting Started

### Prerequisites
- **Node.js** 20+
- **npm** (or Bun)
- A **Google Gemini API key** (optional — all core WBGT calculations, templates, and heuristic responses continue to work in fallback mode without an API key)

### Installation

```bash
git clone <your-repository-url>
cd heatshield-ai
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
# Optional: override default server port (defaults to 3000)
DEFAULT_APP_PORT=3000
```

> **Security Note**: Never commit `.env` or expose `GEMINI_API_KEY` in client-side code. All Gemini requests are executed server-side in `server.ts`.

### Running Locally

```bash
# Start full-stack development server (Express + Vite middleware on port 3000)
npm run dev
```

Open `http://localhost:3000` in your browser. Allow **Geolocation** (for Rider cooling station proximity) and **Microphone** (for Voice Safety Q&A) permissions when prompted.

### Production Build & Type Check

```bash
# Type-check TypeScript
npm run lint

# Build frontend bundle into dist/
npm run build

# Run production server
npm start
```

---

## API Endpoints (`server.ts`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Server health and bound port status |
| `POST` | `/api/gemini/heat-advice` | Generates WBGT driver explanation and 6-language alerts |
| `POST` | `/api/gemini/smartshift-plan` | Builds 06:00–18:00 crew schedule enforcing the 12:30–15:00 UAE Midday Break |
| `POST` | `/api/gemini/voice-qa` | Answers worker/rider safety questions in both English and Arabic |
| `POST` | `/api/gemini/tts` | Synthesizes spoken audio (English & Arabic) with client fallback flag |
| `POST` | `/api/gemini/transcribe` | Transcribes recorded microphone audio clips (`en` / `ar`) |
| `GET` | `/api/sensor-proxy?url=...` | Proxies live ESP32 / JSON environmental sensor feeds |
| `GET` | `/api/weather-forecast` | Fetches Dubai hourly forecast from Open-Meteo with fallback |

---

## Project Structure

```text
├── server.ts                  # Express server, Vite middleware, Gemini & proxy API routes
├── metadata.json              # App metadata & iframe permissions (geolocation, microphone)
├── index.html                 # HTML entry point & Google Fonts (Plus Jakarta Sans, Tajawal, etc.)
└── src/
    ├── App.tsx                # Root state (locale, role, WBGT inputs, shared hydration state)
    ├── components/
    │   ├── LandingPage.tsx    # Animated flying-card landing screen & guest entry
    │   ├── WorkerView.tsx     # Outdoor worker dashboard, buddy check & symptom SOS
    │   ├── RiderView.tsx      # Delivery rider cool-by routing & Dubai rest hub radar
    │   ├── SupervisorView.tsx # Site command console, SmartShift planner & feedback log
    │   ├── HydrationTrackerWidget.tsx # Risk-adaptive water/electrolyte tracker, streak & celebration
    │   ├── VoiceQaModal.tsx   # Bilingual mic recorder, live waveform & voice Q&A modal
    │   ├── DemoControlsDrawer.tsx # Live ESP32 sensor URL & 60s heat-wave simulator
    │   └── WhyAlertDrawer.tsx # WBGT mathematical breakdown & ISO 7243 transparency
    ├── data/                  # Certified Dubai cooling stations & reference data
    ├── types/                 # Shared TypeScript interfaces
    └── utils/
        ├── riskEngine.ts      # Deterministic WBGT & UAE MoHRE Midday Ban evaluator
        ├── speech.ts          # Gemini TTS playback, Web Audio chimes & speech recognition
        └── i18n.ts            # English & Arabic UI localization dictionaries
```

---

## Disclaimer

HeatShield AI is an occupational thermal-safety decision-support and planning aid. It does **not** provide medical diagnoses. In any suspected case of heat exhaustion or heat stroke, stop physical work immediately, move to a cooled area, begin active cooling, and contact emergency medical services (**998** in Dubai / UAE).
