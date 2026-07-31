import { Asset } from "expo-asset";
import { useEffect, useState } from "react";
import {
  loadTensorflowModel,
  type TensorflowModelDelegate,
  type TensorflowPlugin,
} from "react-native-fast-tflite";

// Metro resolves model assets through a static require just like images/fonts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL_MODULE = require("@/assets/models/yolov8n.tflite");

export function useYoloV8Model(
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
      setState({ model: undefined, state: "loading" });

      try {
        const [asset] = await Asset.loadAsync(MODEL_MODULE);
        const localUri = asset.localUri;

        if (!localUri?.startsWith("file://")) {
          throw new Error(`Model did not resolve to a local file: ${localUri}`);
        }

        const model = await loadTensorflowModel(
          { url: localUri },
          delegates,
        );

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

    // Delegates are compared by their contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delegatesKey]);

  return state;
}
