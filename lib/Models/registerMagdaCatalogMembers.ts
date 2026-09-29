import CatalogMemberFactory from "terriajs/lib/Models/Catalog/CatalogMemberFactory";
import Terria from "terriajs/lib/Models/Terria";
import MagdaCatalogGroup from "./MagdaCatalogGroup";
import MagdaPreviewReference from "./MagdaPreviewReference";

/**
 * Register the narrow compatibility seam used by the Magda preview caller and
 * the lazy full-map catalog that lists further Magda datasets. The deprecated
 * upstream `magda` type is intentionally not registered.
 */
export default function registerMagdaCatalogMembers(_terria: Terria): void {
  CatalogMemberFactory.register(
    MagdaPreviewReference.type,
    MagdaPreviewReference
  );
  CatalogMemberFactory.register(MagdaCatalogGroup.type, MagdaCatalogGroup);
}
