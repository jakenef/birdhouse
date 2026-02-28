import { describe, expect, it } from "vitest";

import {
  GoogleStreetViewService,
  StreetViewImageResponse,
} from "./googleStreetView";
import { StreetViewCacheEntry } from "../types/property";

type MockResponse = {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
  binaryBody?: Buffer;
};

function createFetch(responses: MockResponse[], urls: string[] = []) {
  return async (input: string) => {
    urls.push(input);
    const next = responses.shift();
    if (!next) {
      throw new Error("Unexpected fetch call.");
    }

    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      headers: {
        get(name: string) {
          return next.headers?.[name.toLowerCase()] || null;
        },
      },
      async json() {
        return next.jsonBody;
      },
      async arrayBuffer() {
        return (next.binaryBody || Buffer.from("image")).buffer.slice(
          (next.binaryBody || Buffer.from("image")).byteOffset,
          (next.binaryBody || Buffer.from("image")).byteOffset +
            (next.binaryBody || Buffer.from("image")).byteLength,
        );
      },
    };
  };
}

describe("GoogleStreetViewService", () => {
  it("resolves a direct street view match by address", async () => {
    const service = new GoogleStreetViewService(
      createFetch([
        {
          jsonBody: {
            status: "OK",
            pano_id: "pano-123",
            location: {
              lat: 44.0901,
              lng: -123.0482,
              description: "2109 Kingfisher Way, Eugene, OR 97401, USA",
            },
          },
        },
        {
          jsonBody: {
            status: "OK",
            results: [
              {
                formatted_address: "2109 Kingfisher Way, Eugene, OR 97401, USA",
                geometry: {
                  location: {
                    lat: 44.0875,
                    lng: -123.0969,
                  },
                },
              },
            ],
          },
        },
      ]),
      { apiKey: "test-key" },
    );

    const result = await service.lookup({
      address_full: "2109 Kingfisher Way",
      city: "Eugene",
      state: "OR",
      zip: "97401",
    });

    expect(result).toMatchObject({
      status: "available",
      source_address: "2109 Kingfisher Way, Eugene, OR 97401",
      resolved_address: "2109 Kingfisher Way, Eugene, OR 97401, USA",
      latitude: 44.0901,
      longitude: -123.0482,
      target_latitude: 44.0875,
      target_longitude: -123.0969,
      pano_id: "pano-123",
      heading: 266,
      error_message: null,
    });
  });

  it("falls back to geocoding when direct lookup has no results", async () => {
    const service = new GoogleStreetViewService(
      createFetch([
        { jsonBody: { status: "ZERO_RESULTS" } },
        {
          jsonBody: {
            status: "OK",
            results: [
              {
                formatted_address: "2109 Kingfisher Way, Eugene, OR 97401, USA",
                geometry: {
                  location: {
                    lat: 44.0901,
                    lng: -123.0482,
                  },
                },
              },
            ],
          },
        },
        {
          jsonBody: {
            status: "OK",
            pano_id: "pano-456",
            location: {
              lat: 44.0901,
              lng: -123.0482,
            },
          },
        },
      ]),
      { apiKey: "test-key" },
    );

    const result = await service.lookup({
      address_full: "2109 Kingfisher Way",
      city: "Eugene",
      state: "OR",
      zip: "97401",
    });

    expect(result.status).toBe("available");
    expect(result.pano_id).toBe("pano-456");
    expect(result.heading).not.toBeNull();
  });

  it("marks the address unavailable when no pano is found", async () => {
    const service = new GoogleStreetViewService(
      createFetch([
        { jsonBody: { status: "ZERO_RESULTS" } },
        { jsonBody: { status: "ZERO_RESULTS" } },
      ]),
      { apiKey: "test-key" },
    );

    const result = await service.lookup({
      address_full: "Unknown Address",
      city: "Nowhere",
      state: "OR",
      zip: "00000",
    });

    expect(result.status).toBe("unavailable");
    expect(result.pano_id).toBeNull();
  });

  it("returns an error cache entry when the API key is missing", async () => {
    const service = new GoogleStreetViewService(createFetch([]), { apiKey: "" });

    const result = await service.lookup({
      address_full: "2109 Kingfisher Way",
      city: "Eugene",
      state: "OR",
      zip: "97401",
    });

    expect(result.status).toBe("error");
    expect(result.error_message).toContain("API key");
  });

  it("fetches image bytes from the static API with a computed heading", async () => {
    const imageBytes = Buffer.from("street-view-image");
    const urls: string[] = [];
    const service = new GoogleStreetViewService(
      createFetch([
        {
          headers: {
            "content-type": "image/jpeg",
          },
          binaryBody: imageBytes,
        },
      ], urls),
      { apiKey: "test-key" },
    );

    const cacheEntry: StreetViewCacheEntry = {
      status: "available",
      last_checked_at_iso: "2026-02-28T00:00:00.000Z",
      source_address: "2109 Kingfisher Way, Eugene, OR 97401",
      resolved_address: "2109 Kingfisher Way, Eugene, OR 97401, USA",
      latitude: 44.0901,
      longitude: -123.0482,
      target_latitude: 44.0875,
      target_longitude: -123.0969,
      heading: 266,
      pano_id: "pano-123",
      error_message: null,
    };

    const image: StreetViewImageResponse = await service.fetchImage(cacheEntry);

    expect(image.contentType).toBe("image/jpeg");
    expect(image.body.equals(imageBytes)).toBe(true);
    expect(urls[0]).toContain("heading=266");
  });
});
