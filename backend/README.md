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
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
MAX_FILE_MB=15
REQUEST_TIMEOUT_MS=60000
```

Notes:

- `/api/parse` requires the Google Document AI and OpenAI variables above.
- `/api/properties` mock persistence can run without those parse-service credentials.
- `GOOGLE_MAPS_API_KEY` enables backend-only street view lookup and proxying for mock property cards.
- `MOCK_PROPERTIES_DB_PATH` is optional and only affects the mock property store path.

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

## Mock Property Endpoints

These endpoints are mock-database ready. They use a file-backed store today, but the
route contract is intended to stay stable if the storage layer is replaced with a real
database later.

### Save a parsed contract

`POST /api/properties`

- Content type: `application/json`
- Request body: exact `ParsedPurchaseContract` JSON returned by `/api/parse`

Example flow:

1. Call `/api/parse`
2. Send the returned JSON to `/api/properties`

Success response:

```json
{
  "property": {
    "id": "prop_...",
    "property_name": "6150 Hahn Run Suite 008, Park City, UT 84605",
    "doc_hash": "396d6e5e0edff43917d92cf5f48ce979cfa74a66f7e480afdc6c28a53e8294c8",
    "created_at_iso": "2026-02-28T03:00:00.000Z",
    "updated_at_iso": "2026-02-28T03:00:00.000Z"
  }
}
```

### List properties for frontend cards

`GET /api/properties`

This is the endpoint the frontend should use to populate property cards.

Response shape:

```json
{
  "properties": [
    {
      "id": "prop_...",
      "property_name": "6150 Hahn Run Suite 008, Park City, UT 84605",
      "doc_hash": "396d6e5e0edff43917d92cf5f48ce979cfa74a66f7e480afdc6c28a53e8294c8",
      "address_full": "6150 Hahn Run Suite 008, Park City, UT 84605",
      "city": "Park City",
      "state": "UT",
      "zip": "84605",
      "purchase_price": 424106,
      "buyers": ["Gerald Davis", "Jasmine Figueroa"],
      "sellers": ["Fitzgerald Ltd Inc."],
      "effective_date": "2026-03-04",
      "settlement_deadline": "2026-04-30",
      "created_at_iso": "2026-02-28T03:00:00.000Z",
      "updated_at_iso": "2026-02-28T03:00:00.000Z",
      "street_view": {
        "status": "available",
        "image_url": "/api/properties/prop_.../street-view",
        "last_checked_at_iso": "2026-02-28T03:01:00.000Z",
        "source_address": "6150 Hahn Run Suite 008, Park City, UT 84605",
        "resolved_address": null,
        "latitude": 40.6461,
        "longitude": -111.498,
        "pano_id": "google-pano-id"
      }
    }
  ]
}
```

Notes:

- `GET /api/properties` lazily hydrates missing `street_view` metadata for mock records and persists the cache to the property store.
- When no panorama is available, `street_view.status` becomes `unavailable` and `image_url` is `null`.
- When Google lookup fails, `street_view.status` becomes `error` and `image_url` is `null`.

### Fetch the card image from the backend

`GET /api/properties/:propertyId/street-view`

This route proxies Google Street View Static API from the backend so the frontend never sees the Google API key.

Behavior:

- returns `200` with `image/jpeg` when the property has an available cached street view
- returns `404` when the property does not exist or no street view image is available

Example:

```bash
curl http://localhost:3001/api/properties/prop_123/street-view --output street-view.jpg
```

### Mock storage file

The default mock store path is:

`backend/data/mock-properties.json`

You can override it with:

```env
MOCK_PROPERTIES_DB_PATH=C:\path\to\mock-properties.json
```

## Tests

```bash
cd backend
npm test
```
