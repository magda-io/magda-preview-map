import { runInAction } from "mobx";
import Terria from "terriajs/lib/Models/Terria";
import ViewState from "terriajs/lib/ReactViewModels/ViewState";

const hiddenPreviewElements = [
  "menu-bar",
  "show-workbench",
  "my-location",
  "split-tool",
  "pedestrian-mode",
  "measure-tool",
  "feedback"
];

/**
 * Apply the compact chrome expected by the Magda iframe URL while retaining
 * Terria's map, zoom controls and feature-information panel.
 *
 * `mode=preview` was a Magda application convention in the TerriaJS 6 shell;
 * TerriaJS 8 parses it as a user property but does not interpret it itself.
 */
export default function configurePreviewMode(
  terria: Terria,
  viewState: ViewState
): void {
  if (terria.userProperties.get("mode") !== "preview") return;

  runInAction(() => {
    viewState.isMapFullScreen = true;
    viewState.explorerPanelIsVisible = false;
    hiddenPreviewElements.forEach((id) => {
      terria.elements.set(id, { visible: false });
    });
  });
}
