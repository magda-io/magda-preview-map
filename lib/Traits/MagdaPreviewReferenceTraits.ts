import CatalogMemberReferenceTraits from "terriajs/lib/Traits/TraitsClasses/CatalogMemberReferenceTraits";
import UrlTraits from "terriajs/lib/Traits/TraitsClasses/UrlTraits";
import primitiveTrait from "terriajs/lib/Traits/Decorators/primitiveTrait";
import mixTraits from "terriajs/lib/Traits/mixTraits";
import { traitClass } from "terriajs/lib/Traits/Trait";

@traitClass({
  description:
    "Resolves the legacy Magda preview catalog payload to a native TerriaJS 8 catalog item."
})
export default class MagdaPreviewReferenceTraits extends mixTraits(
  CatalogMemberReferenceTraits,
  UrlTraits
) {
  @primitiveTrait({
    type: "string",
    name: "Distribution ID",
    description: "The Magda distribution Registry record to preview."
  })
  distributionId?: string;

  @primitiveTrait({
    type: "string",
    name: "Dataset ID",
    description: "Legacy dataset Registry record containing distributions."
  })
  datasetId?: string;

  @primitiveTrait({
    type: "string",
    name: "Storage API URL",
    description: "Base URL used to resolve magda://storage-api resources."
  })
  storageApiUrl?: string;

  @primitiveTrait({
    type: "string",
    name: "Default bucket",
    description: "Current caller field naming the Storage API bucket."
  })
  defaultBucket?: string;

  @primitiveTrait({
    type: "string",
    name: "Dataset bucket",
    description: "Legacy alias for the Storage API bucket."
  })
  datasetBucket?: string;

  @primitiveTrait({
    type: "string",
    name: "Selected WMS layer",
    description: "Authoritative WMS layer selected by the Magda web client."
  })
  selectedWmsLayerName?: string;

  @primitiveTrait({
    type: "string",
    name: "Selected WFS feature type",
    description:
      "Authoritative WFS feature type selected by the Magda web client."
  })
  selectedWfsFeatureTypeName?: string;

  @primitiveTrait({
    type: "boolean",
    name: "Enabled",
    description: "Legacy request to add the resolved item to the workbench."
  })
  isEnabled = false;

  @primitiveTrait({
    type: "boolean",
    name: "Zoom on enable",
    description: "Legacy request to zoom to the item after it is enabled."
  })
  zoomOnEnable = false;
}
