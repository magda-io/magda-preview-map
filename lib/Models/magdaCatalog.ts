import type { JsonObject } from "terriajs/lib/Core/Json";
import {
  MAGDA_ITEM_TYPE,
  MagdaPreviewRecord,
  resolveMagdaBaseUrl
} from "./magdaPreviewCompatibility";

export const MAGDA_CATALOG_GROUP_TYPE = "magda-catalog-group";
export const MAGDA_CATALOG_ROOT_ID = "magda-data-catalog";
export const MAGDA_CATALOG_ROOT_NAME = "Magda data catalog";
export const MAGDA_CATALOG_MORE_NAME = "More datasets…";
export const DEFAULT_CATALOG_PAGE_SIZE = 50;
export const MAX_CATALOG_PAGE_SIZE = 100;

/** Deployment values a catalog group hands on to its child references. */
export interface MagdaCatalogSettings {
  url?: string;
  storageApiUrl?: string;
  defaultBucket?: string;
  datasetBucket?: string;
}

export interface MagdaCatalogPage {
  records: MagdaPreviewRecord[];
  hasMore: boolean;
  nextPageToken?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function effectiveCatalogPageSize(pageSize: number | undefined): number {
  if (typeof pageSize !== "number" || !Number.isFinite(pageSize)) {
    return DEFAULT_CATALOG_PAGE_SIZE;
  }
  return Math.min(MAX_CATALOG_PAGE_SIZE, Math.max(1, Math.floor(pageSize)));
}

/**
 * Build one bounded Registry dataset-list request. The request stays on the
 * Magda gateway (normally same-origin) so the Registry applies the viewer's
 * own `object/record/read` decision.
 */
export function buildRegistryRecordsListUrl(options: {
  url?: string;
  pageSize?: number;
  pageToken?: string;
}): string {
  if (!options.url) throw new Error("A Magda URL is required");

  const url = new URL(
    "api/v0/registry/records",
    resolveMagdaBaseUrl(options.url)
  );
  url.searchParams.set("aspect", "dcat-dataset-strings");
  url.searchParams.set(
    "limit",
    String(effectiveCatalogPageSize(options.pageSize))
  );
  if (options.pageToken) url.searchParams.set("pageToken", options.pageToken);
  return url.toString();
}

export function parseRegistryRecordsPage(response: unknown): MagdaCatalogPage {
  const body = isObject(response) ? response : {};
  const records = Array.isArray(body.records)
    ? body.records
        .filter(isObject)
        .map((record) => record as MagdaPreviewRecord)
        .filter((record) => stringValue(record.id) !== undefined)
    : [];
  const nextPageToken = stringValue(body.nextPageToken);
  return {
    records,
    // Without a token there is no way to continue, whatever hasMore says.
    hasMore: body.hasMore === true && nextPageToken !== undefined,
    nextPageToken
  };
}

export function catalogDatasetTitle(record: MagdaPreviewRecord): string {
  const aspects = isObject(record.aspects) ? record.aspects : {};
  const dataset = aspects["dcat-dataset-strings"];
  return (
    (isObject(dataset) ? stringValue(dataset.title) : undefined) ??
    stringValue(record.name) ??
    record.id ??
    ""
  );
}

export function catalogDatasetMemberId(
  rootCatalogId: string,
  recordId: string
): string {
  return `${rootCatalogId}/dataset/${encodeURIComponent(recordId)}`;
}

export function catalogContinuationId(
  rootCatalogId: string,
  pageToken: string
): string {
  return `${rootCatalogId}/page/${encodeURIComponent(pageToken)}`;
}

function settingsJson(settings: MagdaCatalogSettings): JsonObject {
  const json: JsonObject = {};
  (["url", "storageApiUrl", "defaultBucket", "datasetBucket"] as const).forEach(
    (key) => {
      const value = settings[key];
      if (value !== undefined) json[key] = value;
    }
  );
  return json;
}

/**
 * Trait JSON for a lazily resolved dataset reference. It deliberately omits
 * `isEnabled`/`zoomOnEnable`: browsing the catalog must not load anything.
 */
export function catalogDatasetReferenceJson(
  record: MagdaPreviewRecord,
  settings: MagdaCatalogSettings
): JsonObject {
  return {
    ...settingsJson(settings),
    name: catalogDatasetTitle(record),
    datasetId: record.id!,
    isMappable: true
  };
}

/** Trait JSON for a lazy "More datasets…" continuation group. */
export function catalogContinuationJson(
  pageToken: string,
  rootCatalogId: string,
  pageSize: number | undefined,
  settings: MagdaCatalogSettings
): JsonObject {
  return {
    ...settingsJson(settings),
    name: MAGDA_CATALOG_MORE_NAME,
    pageToken,
    rootCatalogId,
    pageSize: effectiveCatalogPageSize(pageSize)
  };
}

function findMagdaItem(value: unknown): Record<string, unknown> | undefined {
  const visited = new WeakSet<object>();

  function visit(candidate: unknown): Record<string, unknown> | undefined {
    if (!candidate || typeof candidate !== "object") return undefined;
    if (visited.has(candidate)) return undefined;
    visited.add(candidate);

    if (isObject(candidate) && candidate.type === MAGDA_ITEM_TYPE) {
      return candidate;
    }
    for (const child of Object.values(candidate)) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  }

  return visit(value);
}

function containsId(value: unknown, id: string): boolean {
  const visited = new WeakSet<object>();

  function visit(candidate: unknown): boolean {
    if (!candidate || typeof candidate !== "object") return false;
    if (visited.has(candidate)) return false;
    visited.add(candidate);
    if (isObject(candidate) && candidate.id === id) return true;
    return Object.values(candidate).some(visit);
  }

  return visit(value);
}

/**
 * Add the lazy Magda catalog root to full-map start data, copying deployment
 * values from the incoming `magda-item`. Returns the input unchanged when the
 * app is in compact preview mode, when there is no `magda-item`, or when the
 * root already exists (in the start data or, via `hasCatalogRoot`, in Terria).
 */
export function addMagdaCatalogToStartData(
  startData: unknown,
  options: { mode?: string; hasCatalogRoot?: boolean }
): unknown {
  if (options.mode === "preview" || options.hasCatalogRoot) return startData;
  if (!isObject(startData) || !Array.isArray(startData.initSources)) {
    return startData;
  }
  if (containsId(startData, MAGDA_CATALOG_ROOT_ID)) return startData;

  const sourceIndex = startData.initSources.findIndex(
    (source) => findMagdaItem(source) !== undefined
  );
  if (sourceIndex === -1) return startData;

  const initSource = startData.initSources[sourceIndex];
  const magdaItem = findMagdaItem(initSource)!;
  const settings: MagdaCatalogSettings = {
    url: stringValue(magdaItem.url),
    storageApiUrl: stringValue(magdaItem.storageApiUrl),
    defaultBucket: stringValue(magdaItem.defaultBucket),
    datasetBucket: stringValue(magdaItem.datasetBucket)
  };
  if (!settings.url) return startData;

  const catalogRoot = {
    id: MAGDA_CATALOG_ROOT_ID,
    type: MAGDA_CATALOG_GROUP_TYPE,
    name: MAGDA_CATALOG_ROOT_NAME,
    ...settingsJson(settings),
    pageSize: DEFAULT_CATALOG_PAGE_SIZE
  };
  const catalog = Array.isArray(initSource.catalog) ? initSource.catalog : [];
  const initSources = [...startData.initSources];
  initSources[sourceIndex] = {
    ...initSource,
    catalog: [...catalog, catalogRoot]
  };
  return { ...startData, initSources };
}
