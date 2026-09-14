export interface MagdaPreviewDefinition {
  type: string;
  name?: string;
  url: string;
  layers?: string;
  typeNames?: string;
}

export interface MagdaPreviewRecord {
  id?: string;
  name?: string;
  aspects?: Record<string, unknown>;
}

export interface MagdaPreviewProperties {
  url?: string;
  storageApiUrl?: string;
  distributionId?: string;
  datasetId?: string;
  defaultBucket?: string;
  datasetBucket?: string;
  selectedWmsLayerName?: string;
  selectedWfsFeatureTypeName?: string;
  name?: string;
}

export const MAGDA_ITEM_TYPE = "magda-item";
export const DEFAULT_DATASET_BUCKET = "magda-datasets";
export const WFS_DEFAULT_MAX_FEATURES = 1000;

const OWS_QUERY_PARAMETERS = [
  "request",
  "service",
  "layers",
  "layer",
  "layername",
  "typename",
  "typenames",
  "version",
  "outputformat"
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function effectiveDatasetBucket(
  properties: MagdaPreviewProperties
): string {
  return (
    properties.defaultBucket ??
    properties.datasetBucket ??
    DEFAULT_DATASET_BUCKET
  );
}

export function rewriteStorageApiUrl(
  resourceUrl: string,
  storageApiUrl: string | undefined,
  bucket: string
): string {
  const prefix = "magda://storage-api/";
  if (!resourceUrl.startsWith(prefix) || !storageApiUrl) return resourceUrl;

  return `${storageApiUrl.replace(/\/+$/, "")}/${bucket}/${resourceUrl.slice(
    prefix.length
  )}`;
}

export function cleanOwsUrl(resourceUrl: string): string {
  const url = new URL(resourceUrl);
  Array.from(url.searchParams.keys()).forEach((key) => {
    if (OWS_QUERY_PARAMETERS.includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  });
  return url.toString();
}

export function buildRegistryRecordUrl(
  properties: MagdaPreviewProperties
): string {
  const recordId = properties.distributionId ?? properties.datasetId;
  if (!properties.url || !recordId) {
    throw new Error("A Magda URL and distributionId or datasetId are required");
  }

  const url = new URL(
    `api/v0/registry/records/${encodeURIComponent(recordId)}`,
    properties.url.endsWith("/") ? properties.url : `${properties.url}/`
  );
  if (properties.distributionId) {
    url.searchParams.set("aspect", "dcat-distribution-strings");
  } else {
    url.searchParams.set("aspect", "dataset-distributions");
    url.searchParams.set("dereference", "true");
  }
  url.searchParams.set("optionalAspect", "dataset-format");
  return url.toString();
}

export function distributionsFromRecord(
  record: MagdaPreviewRecord
): MagdaPreviewRecord[] {
  const aspects = isObject(record.aspects) ? record.aspects : {};
  if (isObject(aspects["dcat-distribution-strings"])) return [record];

  const datasetDistributions = aspects["dataset-distributions"];
  if (!isObject(datasetDistributions)) return [];
  const distributions = datasetDistributions.distributions;
  return Array.isArray(distributions)
    ? distributions.filter(isObject).map((value) => value as MagdaPreviewRecord)
    : [];
}

export function distributionFormat(
  distribution: MagdaPreviewRecord
): string | undefined {
  const aspects = isObject(distribution.aspects) ? distribution.aspects : {};
  const datasetFormat = aspects["dataset-format"];
  if (isObject(datasetFormat)) {
    const format = stringValue(datasetFormat.format);
    if (format) return format;
  }

  const dcat = aspects["dcat-distribution-strings"];
  return isObject(dcat) ? stringValue(dcat.format) : undefined;
}

export function distributionUrl(
  distribution: MagdaPreviewRecord
): string | undefined {
  const aspects = isObject(distribution.aspects) ? distribution.aspects : {};
  const dcat = aspects["dcat-distribution-strings"];
  if (!isObject(dcat)) return undefined;
  return stringValue(dcat.downloadURL) ?? stringValue(dcat.accessURL);
}

export function definitionFromDistribution(
  distribution: MagdaPreviewRecord,
  properties: MagdaPreviewProperties
): MagdaPreviewDefinition | undefined {
  const rawUrl = distributionUrl(distribution);
  const format = distributionFormat(distribution)?.trim().toLowerCase();
  if (!rawUrl || !format) return undefined;

  const url = rewriteStorageApiUrl(
    rawUrl,
    properties.storageApiUrl,
    effectiveDatasetBucket(properties)
  );
  const common = { name: properties.name ?? distribution.name, url };

  if (format === "wms") {
    return {
      ...common,
      type: "wms",
      url: cleanOwsUrl(url),
      layers: properties.selectedWmsLayerName
    };
  }
  if (format === "wfs") {
    return {
      ...common,
      type: "wfs",
      url: cleanOwsUrl(url),
      typeNames: properties.selectedWfsFeatureTypeName
    };
  }
  if (
    /^esri (mapserver|map server|rest|tiled map service|featureserver)$/.test(
      format
    )
  ) {
    const pathname = new URL(url).pathname;
    if (/\/featureserver(?:\/\d+)?\/?$/i.test(pathname)) {
      return { ...common, type: "esri-featureServer" };
    }
    if (/\/mapserver(?:\/\d+)?\/?$/i.test(pathname)) {
      return { ...common, type: "esri-mapServer" };
    }
    return undefined;
  }
  if (/^csv(-geo-)?/.test(format)) return { ...common, type: "csv" };
  if (format === "geojson") return { ...common, type: "geojson" };
  if (/^km[lz]$/.test(format)) return { ...common, type: "kml" };
  if (format === "czml") return { ...common, type: "czml" };
  return undefined;
}

export function findCompatibleDefinition(
  record: MagdaPreviewRecord,
  properties: MagdaPreviewProperties
): MagdaPreviewDefinition | undefined {
  for (const distribution of distributionsFromRecord(record)) {
    const definition = definitionFromDistribution(distribution, properties);
    if (definition) return definition;
  }
  return undefined;
}

export function isFeatureServerRoot(url: string): boolean {
  return /\/featureserver\/?$/i.test(new URL(url).pathname);
}
