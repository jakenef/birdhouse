# Birdhouse Backend

Backend-only purchase contract parsing API for local testing.

## Requirements

- Node.js 20+
- npm
- A Google Cloud Document AI processor configured for purchase contracts
- A valid OpenAI API key and model

## Environment

Create `backend/.env` with:

```env
PORT=3001
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us
DOCUMENT_AI_PROCESSOR_ID=your-document-ai-processor-id
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1
MAX_FILE_MB=15
REQUEST_TIMEOUT_MS=60000
```

## Install

```bash
cd backend
npm install
```

## Run

```bash
cd backend
npm run dev
```

Health check:

```bash
curl http://localhost:3001/health
```

## Parse Endpoint

`POST /api/parse`

- Content type: `multipart/form-data`
- File field: `file`
- Supported mime: `application/pdf`

Example:

```bash
curl -X POST http://localhost:3001/api/parse \
  -F "file=@C:\Users\Hayde\Downloads\document-birdhouse\out_all_opening_clause_fix\UT-DEMO-7ZPCSZMU.pdf;type=application/pdf"
```

## Manual Smoke Test

Use the supplied PDF:

`C:\Users\Hayde\Downloads\document-birdhouse\out_all_opening_clause_fix\UT-DEMO-7ZPCSZMU.pdf`

Sanity check the JSON response:

- `metadata.doc_hash` is present
- `metadata.filename` matches the uploaded file name
- `metadata.page_count` is `0` or higher
- all top-level sections are present
- dates are `YYYY-MM-DD` or `null`
- missing critical fields appear in `obligations_and_risks.missing_info`
- summary mentions only values present in the parsed contract data

## Tests

```bash
cd backend
npm test
```
