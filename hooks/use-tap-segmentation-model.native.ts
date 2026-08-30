import { Asset } from "expo-asset";
import { useEffect, useState } from "react";
import {
  loadTensorflowModel,
  type TensorflowModelDelegate,
  type TensorflowPlugin,
} from "react-native-fast-tflite";

/**
 * Load a tap-conditioned TFLite asset without hard-coding an asset that does
 * not exist until the first trained checkpoint is accepted.  Callers should
 * pass a static Metro require, for example:
 *
 *   useTapSegmentationModel(require("@/assets/models/tapseg-256.tflite"), [])
 */
export function useTapSegmentationModel(
  modelModule: number | null | undefined,
  delegates: TensorflowModelDelegate[],
): TensorflowPlugin {
  const [state, setState] = useState<TensorflowPlugin>({
    model: undefined,
    state: "loading",
  });
  const delegatesKey = JSON.stringify(delegates);

  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      if (modelModule == null) {
        setState({
          model: undefined,
          state: "error",
          error: new Error(
            "Tap segmentation model asset is not configured. Train/export the model and add its .tflite asset first.",
          ),
        });
        return;
      }

      setState({ model: undefined, state: "loading" });
      try {
        const [asset] = await Asset.loadAsync(modelModule);
        const localUri = asset.localUri;
        if (!localUri?.startsWith("file://")) {
          throw new Error(`Tap segmentation model did not resolve to a local file: ${localUri}`);
        }

        const model = await loadTensorflowModel({ url: localUri }, delegates);
        if (!cancelled) {
          setState({ model, state: "loaded" });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            model: undefined,
            state: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    }

    void loadModel();
    return () => {
      cancelled = true;
    };
    // Delegates are compared by contents rather than array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delegatesKey, modelModule]);

  return state;
}
