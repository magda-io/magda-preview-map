import CatalogMemberTraits from "terriajs/lib/Traits/TraitsClasses/CatalogMemberTraits";
import GroupTraits from "terriajs/lib/Traits/TraitsClasses/GroupTraits";
import UrlTraits from "terriajs/lib/Traits/TraitsClasses/UrlTraits";
import primitiveTrait from "terriajs/lib/Traits/Decorators/primitiveTrait";
import mixTraits from "terriajs/lib/Traits/mixTraits";
import { traitClass } from "terriajs/lib/Traits/Trait";

@traitClass({
  description:
    "Lazily lists the dataset records a Magda deployment's Registry returns for the current viewer."
})
export default class MagdaCatalogGroupTraits extends mixTraits(
  GroupTraits,
  UrlTraits,
  CatalogMemberTraits
) {
  @primitiveTrait({
    type: "string",
    name: "Storage API URL",
    description: "Passed to child dataset references."
  })
  storageApiUrl?: string;

  @primitiveTrait({
    type: "string",
    name: "Default bucket",
    description: "Storage API bucket passed to child dataset references."
  })
  defaultBucket?: string;

  @primitiveTrait({
    type: "string",
    name: "Dataset bucket",
    description: "Legacy bucket alias passed to child dataset references."
  })
  datasetBucket?: string;

  @primitiveTrait({
    type: "number",
    name: "Page size",
    description: "Number of Registry records loaded per catalog page."
  })
  pageSize?: number;

  @primitiveTrait({
    type: "string",
    name: "Page token",
    description:
      "Internal: Registry continuation token for a 'More datasets…' page."
  })
  pageToken?: string;

  @primitiveTrait({
    type: "string",
    name: "Root catalog ID",
    description:
      "Internal: root catalog ID used to build deterministic child IDs."
  })
  rootCatalogId?: string;
}
