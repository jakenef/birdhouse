import { buildStreetViewLookupAddress } from "../utils/propertyAddress";
import { StreetViewCacheEntry } from "../types/property";

type StreetViewMetadataResponse = {
  status?: string;
  pano_id?: string;
  location?: {
    lat?: number;
    lng?: number;
    description?: string;
  };
  error_message?: string;
};

type GeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  headers: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type FetchLike = (input: string) => Promise<FetchResponseLike>;

type PropertyAddressSource = {
  address_full: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type StreetViewImageResponse = {
  body: Buffer;
  contentType: string;
};

export interface StreetViewService {
  lookup(source: PropertyAddressSource): Promise<StreetViewCacheEntry>;
  fetchImage(cacheEntry: StreetViewCacheEntry): Promise<StreetViewImageResponse>;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeHeading(value: number): number {
  return (value + 360) % 360;
}

function computeHeading(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const fromLatRad = toRadians(fromLatitude);
  const toLatRad = toRadians(toLatitude);
  const deltaLonRad = toRadians(toLongitude - fromLongitude);

  const y = Math.sin(deltaLonRad) * Math.cos(toLatRad);
  const x =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(deltaLonRad);

  return Math.round(normalizeHeading(toDegrees(Math.atan2(y, x))));
}

function buildBaseCacheEntry(
  sourceAddress: string | null,
  status: StreetViewCacheEntry["status"],
  overrides: Partial<StreetViewCacheEntry> = {},
): StreetViewCacheEntry {
    return {
      status,
      last_checked_at_iso: nowIso(),
      source_address: sourceAddress,
      resolved_address: null,
      latitude: null,
      longitude: null,
      target_latitude: null,
      target_longitude: null,
      heading: null,
      pano_id: null,
      error_message: null,
      ...overrides,
    };
}

function buildUrl(pathname: string, params: Record<string, string>): string {
  const url = new URL(pathname, "https://maps.googleapis.com");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function parseJsonResponse<T>(response: FetchResponseLike): Promise<T> {
  return (await response.json()) as T;
}

export class GoogleStreetViewServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleStreetViewServiceError";
  }
}

export class GoogleStreetViewService implements StreetViewService {
  private readonly apiKey: string | null;

  private readonly imageSize: string;

  private readonly imageFov: string;

  private readonly imagePitch: string;

  constructor(
    private readonly fetchImpl: FetchLike = (input) => globalThis.fetch(input),
    options?: {
      apiKey?: string | null;
      imageSize?: string;
      imageFov?: string;
      imagePitch?: string;
    },
  ) {
    this.apiKey = options?.apiKey?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
    this.imageSize =
      options?.imageSize || process.env.GOOGLE_STREET_VIEW_SIZE || "600x400";
    this.imageFov = options?.imageFov || process.env.GOOGLE_STREET_VIEW_FOV || "90";
    this.imagePitch = options?.imagePitch || process.env.GOOGLE_STREET_VIEW_PITCH || "0";
  }

  async lookup(source: PropertyAddressSource): Promise<StreetViewCacheEntry> {
    const sourceAddress = buildStreetViewLookupAddress(source);

    if (!sourceAddress) {
      return buildBaseCacheEntry(sourceAddress, "unavailable");
    }

    if (!this.apiKey) {
      return buildBaseCacheEntry(sourceAddress, "error", {
        error_message: "Google Maps API key is not configured.",
      });
    }

    const metadataByAddress = await this.fetchStreetViewMetadata(sourceAddress);
    const directGeocode = await this.geocodeAddress(sourceAddress);
    const directMatch = this.toAvailableCacheEntry(
      sourceAddress,
      metadataByAddress,
      directGeocode.kind === "available" ? directGeocode : null,
      null,
    );
    if (directMatch) {
      return directMatch;
    }

    if (metadataByAddress.status && this.isFatalStatus(metadataByAddress.status)) {
      return buildBaseCacheEntry(sourceAddress, "error", {
        error_message:
          metadataByAddress.error_message ||
          `Street View metadata request failed with status ${metadataByAddress.status}.`,
      });
    }

    const geocodeResult =
      directGeocode.kind === "available" ||
      directGeocode.kind === "unavailable" ||
      directGeocode.kind === "error"
        ? directGeocode
        : await this.geocodeAddress(sourceAddress);
    if (geocodeResult.kind === "error") {
      return buildBaseCacheEntry(sourceAddress, "error", {
        error_message: geocodeResult.message,
      });
    }

    if (geocodeResult.kind === "unavailable") {
      return buildBaseCacheEntry(sourceAddress, "unavailable");
    }

    const metadataByCoordinates = await this.fetchStreetViewMetadata(
      `${geocodeResult.latitude},${geocodeResult.longitude}`,
    );
    const fallbackMatch = this.toAvailableCacheEntry(
      sourceAddress,
      metadataByCoordinates,
      geocodeResult,
      geocodeResult.formattedAddress,
    );

    if (fallbackMatch) {
      return fallbackMatch;
    }

    if (metadataByCoordinates.status && this.isFatalStatus(metadataByCoordinates.status)) {
      return buildBaseCacheEntry(sourceAddress, "error", {
        error_message:
          metadataByCoordinates.error_message ||
          `Street View metadata request failed with status ${metadataByCoordinates.status}.`,
      });
    }

    return buildBaseCacheEntry(sourceAddress, "unavailable", {
      resolved_address: geocodeResult.formattedAddress,
      latitude: geocodeResult.latitude,
      longitude: geocodeResult.longitude,
      target_latitude: geocodeResult.latitude,
      target_longitude: geocodeResult.longitude,
    });
  }

  async fetchImage(cacheEntry: StreetViewCacheEntry): Promise<StreetViewImageResponse> {
    if (!this.apiKey) {
      throw new GoogleStreetViewServiceError("Google Maps API key is not configured.");
    }

    const query: Record<string, string> = {
      size: this.imageSize,
      fov: this.imageFov,
      pitch: this.imagePitch,
      key: this.apiKey,
      return_error_code: "true",
    };

    if (cacheEntry.pano_id) {
      query.pano = cacheEntry.pano_id;
    } else if (
      isFiniteNumber(cacheEntry.latitude) &&
      isFiniteNumber(cacheEntry.longitude)
    ) {
      query.location = `${cacheEntry.latitude},${cacheEntry.longitude}`;
    } else {
      throw new GoogleStreetViewServiceError(
        "Street View cache entry does not include a pano_id or coordinates.",
      );
    }

    if (isFiniteNumber(cacheEntry.heading)) {
      query.heading = String(cacheEntry.heading);
    }

    const response = await this.fetchImpl(
      buildUrl("/maps/api/streetview", query),
    );

    if (!response.ok) {
      throw new GoogleStreetViewServiceError(
        `Street View image request failed with status ${response.status}.`,
      );
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const body = Buffer.from(await response.arrayBuffer());
    return { body, contentType };
  }

  private async fetchStreetViewMetadata(location: string) {
    const response = await this.fetchImpl(
      buildUrl("/maps/api/streetview/metadata", {
        location,
        key: this.apiKey as string,
      }),
    );

    if (!response.ok) {
      throw new GoogleStreetViewServiceError(
        `Street View metadata request failed with status ${response.status}.`,
      );
    }

    return parseJsonResponse<StreetViewMetadataResponse>(response);
  }

  private async geocodeAddress(address: string): Promise<
    | {
        kind: "available";
        formattedAddress: string | null;
        latitude: number;
        longitude: number;
      }
    | {
        kind: "unavailable";
      }
    | {
        kind: "error";
        message: string;
      }
  > {
    const response = await this.fetchImpl(
      buildUrl("/maps/api/geocode/json", {
        address,
        key: this.apiKey as string,
      }),
    );

    if (!response.ok) {
      throw new GoogleStreetViewServiceError(
        `Geocoding request failed with status ${response.status}.`,
      );
    }

    const payload = await parseJsonResponse<GeocodeResponse>(response);
    const status = payload.status || "UNKNOWN";

    if (status === "ZERO_RESULTS") {
      return { kind: "unavailable" };
    }

    if (status !== "OK") {
      return {
        kind: "error",
        message:
          payload.error_message || `Geocoding request failed with status ${status}.`,
      };
    }

    const result = payload.results?.[0];
    const latitude = result?.geometry?.location?.lat;
    const longitude = result?.geometry?.location?.lng;

    if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
      return { kind: "unavailable" };
    }

    return {
      kind: "available",
      formattedAddress: result?.formatted_address?.trim() || null,
      latitude,
      longitude,
    };
  }

  private isFatalStatus(status: string): boolean {
    return !["OK", "ZERO_RESULTS", "NOT_FOUND"].includes(status);
  }

  private toAvailableCacheEntry(
    sourceAddress: string,
    metadata: StreetViewMetadataResponse,
    target:
      | {
          kind: "available";
          formattedAddress: string | null;
          latitude: number;
          longitude: number;
        }
      | null,
    resolvedAddressFallback: string | null,
  ): StreetViewCacheEntry | null {
    if (metadata.status !== "OK") {
      return null;
    }

    const latitude = metadata.location?.lat;
    const longitude = metadata.location?.lng;
    const panoId = metadata.pano_id?.trim() || null;

    if (!panoId || !isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
      return null;
    }

    const heading =
      target &&
      isFiniteNumber(target.latitude) &&
      isFiniteNumber(target.longitude)
        ? computeHeading(
            latitude,
            longitude,
            target.latitude,
            target.longitude,
          )
        : null;

    return buildBaseCacheEntry(sourceAddress, "available", {
      resolved_address:
        metadata.location?.description?.trim() || resolvedAddressFallback || null,
      latitude,
      longitude,
      target_latitude: target?.latitude ?? null,
      target_longitude: target?.longitude ?? null,
      heading,
      pano_id: panoId,
    });
  }
}
