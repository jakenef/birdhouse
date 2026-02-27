# birdhouse

Contract-to-close transaction manager for residential real estate. test update

## Project Structure

```
birdhouse/
├── backend/          # Node.js + Express + TypeScript API
│   ├── src/
│   │   └── server.ts # Express server with /health endpoint
│   ├── package.json
│   └── tsconfig.json
├── frontend/         # React + Vite + TypeScript
│   ├── src/
│   │   ├── App.tsx   # Main app with health check button
│   │   └── ...
│   └── package.json
└── package.json      # Root workspace scripts
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation

Install dependencies for all packages:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

Or use the convenience script:

```bash
npm run install-all
```

### Development

Start both backend and frontend servers:

```bash
npm run dev
```

This will start:

- **Backend** on http://localhost:3001
- **Frontend** on http://localhost:5173

Or run them individually:

```bash
npm run backend   # Start backend only
npm run frontend  # Start frontend only
```

### Testing the Setup

1. Open your browser to http://localhost:5173
2. Click the "Check Backend Health" button
3. You should see a success message confirming the backend is running

## API Endpoints

### Backend (Port 3001)

- `GET /health` - Health check endpoint
  ```json
  {
    "status": "ok",
    "timestamp": 1772219966260,
    "message": "Backend is running"
  }
  ```

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, CORS
- **Frontend**: React, Vite, TypeScript
- **Dev Tools**: ts-node, concurrently
