import CatalogMemberFactory from "terriajs/lib/Models/Catalog/CatalogMemberFactory";
import Terria from "terriajs/lib/Models/Terria";
import MagdaPreviewReference from "./MagdaPreviewReference";

/** Register the narrow compatibility seam used by the Magda preview caller. */
export default function registerMagdaCatalogMembers(_terria: Terria): void {
  CatalogMemberFactory.register(
    MagdaPreviewReference.type,
    MagdaPreviewReference
  );
}
