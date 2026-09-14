import Terria from "terriajs/lib/Models/Terria";

/**
 * Register Magda-specific catalog models after TerriaJS native models.
 *
 * Issue #29 adds the legacy `magda-item` compatibility reference here. Keeping
 * this hook local prevents Magda behavior from spreading through the upstream
 * TerriaMap bootstrap.
 */
export default function registerMagdaCatalogMembers(_terria: Terria): void {
  // Intentionally empty until the compatibility adapter is added in #29.
}
