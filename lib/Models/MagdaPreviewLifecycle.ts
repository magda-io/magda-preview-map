import { TerriaErrorSeverity } from "terriajs/lib/Core/TerriaError";
import type Terria from "terriajs/lib/Models/Terria";

import { MAGDA_ITEM_TYPE } from "./magdaPreviewCompatibility";

interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

interface PreviewWindow extends MessageTarget {
  location?: { origin?: string };
  parent: MessageTarget | PreviewWindow;
  opener?: MessageTarget | null;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
    options?: boolean
  ): void;
}

interface LifecycleState {
  active: boolean;
  generation: number;
  pendingLoads: number;
  terminal: boolean;
  allowedOrigins: string[];
  window: PreviewWindow;
}

const lifecycleStates = new WeakMap<Terria, LifecycleState>();

function configuredOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "*" || value === "null") {
    return undefined;
  }

  try {
    const url = new URL(value);
    return url.origin === value ? value : undefined;
  } catch {
    return undefined;
  }
}

export function parentMessageAllowedOrigins(
  terria: Pick<Terria, "configParameters">,
  previewWindow: Pick<PreviewWindow, "location">
): string[] {
  const origins: string[] = [];
  const ownOrigin = configuredOrigin(previewWindow.location?.origin);
  if (ownOrigin) origins.push(ownOrigin);

  const configured = terria.configParameters.parentMessageAllowedOrigins;
  if (Array.isArray(configured)) {
    configured.forEach((value) => {
      const origin = configuredOrigin(value);
      if (origin && !origins.includes(origin)) origins.push(origin);
    });
  }
  return origins;
}

export function containsMagdaPreviewItem(value: unknown): boolean {
  const visited = new WeakSet<object>();

  function visit(candidate: unknown): boolean {
    if (!candidate || typeof candidate !== "object") return false;
    if (visited.has(candidate)) return false;
    visited.add(candidate);

    if (
      !Array.isArray(candidate) &&
      "type" in candidate &&
      candidate.type === MAGDA_ITEM_TYPE
    ) {
      return true;
    }

    return Object.values(candidate).some(visit);
  }

  return visit(value);
}

function errorText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  return fallback;
}

function postToEmbeddingWindow(state: LifecycleState, message: unknown): void {
  const targets: MessageTarget[] = [];
  if (state.window.parent !== state.window) targets.push(state.window.parent);
  if (state.window.opener && !targets.includes(state.window.opener)) {
    targets.push(state.window.opener);
  }

  targets.forEach((target) => {
    state.allowedOrigins.forEach((origin) => target.postMessage(message, origin));
  });
}

function postTerminal(
  state: LifecycleState,
  generation: number,
  error?: unknown
): void {
  if (
    !state.active ||
    state.generation !== generation ||
    state.terminal
  ) {
    return;
  }

  state.terminal = true;
  if (!error) {
    postToEmbeddingWindow(state, "loading complete");
    return;
  }

  const candidate = error as { title?: unknown; message?: unknown };
  postToEmbeddingWindow(
    state,
    JSON.stringify({
      type: "error",
      title: errorText(candidate?.title, "Preview load failed"),
      message: errorText(candidate?.message, String(error))
    })
  );
}

export function beginMagdaPreviewItemLoad(
  terria: Terria
): number | undefined {
  const state = lifecycleStates.get(terria);
  if (!state?.active || state.terminal) return undefined;
  state.pendingLoads += 1;
  return state.generation;
}

export function finishMagdaPreviewItemLoad(
  terria: Terria,
  generation: number | undefined,
  error?: unknown
): void {
  if (generation === undefined) return;
  const state = lifecycleStates.get(terria);
  if (!state || state.generation !== generation) return;
  state.pendingLoads = Math.max(0, state.pendingLoads - 1);
  if (error || state.pendingLoads === 0) {
    postTerminal(state, generation, error);
  }
}

export default function configureMagdaPreviewLifecycle(
  terria: Terria,
  previewWindow: PreviewWindow
): void {
  if (lifecycleStates.has(terria)) return;

  const state: LifecycleState = {
    active: false,
    generation: 0,
    pendingLoads: 0,
    terminal: false,
    allowedOrigins: parentMessageAllowedOrigins(terria, previewWindow),
    window: previewWindow
  };
  lifecycleStates.set(terria, state);

  previewWindow.addEventListener(
    "message",
    async (event) => {
      const isParent =
        previewWindow.parent !== previewWindow &&
        event.source === previewWindow.parent;
      const isOpener =
        previewWindow.opener !== null &&
        previewWindow.opener !== undefined &&
        event.source === previewWindow.opener;
      if (
        !state.allowedOrigins.includes(event.origin) ||
        (!isParent && !isOpener)
      ) {
        return;
      }

      if (
        event.data &&
        typeof event.data === "object" &&
        "source" in event.data &&
        typeof event.data.source === "string" &&
        /^react-devtools/i.test(event.data.source)
      ) {
        return;
      }

      const isMagdaPreview = containsMagdaPreviewItem(event.data);
      let generation: number | undefined;
      if (isMagdaPreview) {
        state.active = true;
        state.generation += 1;
        state.pendingLoads = 0;
        state.terminal = false;
        generation = state.generation;
      }

      try {
        const result = await terria.updateFromStartData(
          event.data,
          "Start data from message from parent window",
          TerriaErrorSeverity.Error
        );

        if (generation !== undefined && result.error) {
          postTerminal(state, generation, result.error);
        } else if (generation !== undefined) {
          // MagdaPreviewReference schedules its initial enable check as a
          // microtask. Complete here only when no item load started, which is
          // the reused/already-loaded iframe case.
          Promise.resolve().then(() => {
            if (state.pendingLoads === 0) postTerminal(state, generation!);
          });
        }
        result.raiseError(terria);
      } catch (error) {
        if (generation !== undefined) postTerminal(state, generation, error);
        terria.raiseErrorToUser(error);
      }
    },
    false
  );

  postToEmbeddingWindow(state, "ready");
}
