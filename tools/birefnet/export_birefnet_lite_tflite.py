#!/usr/bin/env python3
"""Convert the MIT BiRefNet Lite ONNX export to a smoke-tested TFLite model.

Run this from Colab or the repository's model-conversion environment. The
converter downloads a pinned ONNX export, asks onnx2tf to preserve its input
shape, invokes the generated TFLite model, and reports output agreement with
ONNX Runtime before copying the requested precision to the destination.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np


MODEL_REPO = "onnx-community/BiRefNet_lite-ONNX"
MODEL_REVISION = "f82954f197e4671c1934c01d7dd85b9687c011b9"
MODEL_FILENAME = "onnx/model.onnx"
BASE_MODEL = "ZhengPeng7/BiRefNet_lite"
IMAGE_SIZE = 1024
EXPECTED_ONNX_INPUT_SHAPE = [1, 3, IMAGE_SIZE, IMAGE_SIZE]


def load_interpreter():
    try:
        from ai_edge_litert.interpreter import Interpreter

        return Interpreter
    except ImportError:
        try:
            import tensorflow as tf

            return tf.lite.Interpreter
        except ImportError as exc:
            raise RuntimeError(
                "No TFLite interpreter is installed. Install ai-edge-litert "
                "or TensorFlow in the conversion environment."
            ) from exc


def tensor_dtype(onnx_type: str) -> np.dtype:
    types = {
        "tensor(float)": np.float32,
        "tensor(float16)": np.float16,
    }
    try:
        return np.dtype(types[onnx_type])
    except KeyError as exc:
        raise RuntimeError(f"Unsupported ONNX input type: {onnx_type}") from exc


def as_mask_plane(tensor: np.ndarray) -> np.ndarray:
    value = np.asarray(tensor)
    value = np.squeeze(value)
    if value.ndim != 2:
        raise RuntimeError(
            f"Expected one 2D mask per image after squeezing batch/channel axes; "
            f"received shape {tensor.shape}."
        )
    return value.astype(np.float32, copy=False)


def convert(args: argparse.Namespace) -> None:
    try:
        from huggingface_hub import hf_hub_download
        import onnxruntime as ort
    except ImportError as exc:
        raise RuntimeError(
            "Install the conversion dependencies first: "
            "pip install huggingface_hub onnxruntime onnx2tf==2.6.9"
        ) from exc

    onnx2tf = shutil.which("onnx2tf")
    if not onnx2tf:
        raise RuntimeError(
            "onnx2tf was not found on PATH. Install onnx2tf==2.6.9 and rerun."
        )

    onnx_path = Path(
        hf_hub_download(
            repo_id=MODEL_REPO,
            filename=MODEL_FILENAME,
            revision=MODEL_REVISION,
        )
    )
    reference = ort.InferenceSession(
        str(onnx_path), providers=["CPUExecutionProvider"]
    )
    onnx_input = reference.get_inputs()[0]
    onnx_input_name = onnx_input.name
    if len(onnx_input.shape) != 4:
        raise RuntimeError(
            f"Expected a rank-4 ONNX image input, got {onnx_input.shape}."
        )
    onnx_input_shape = [
        int(dimension) if isinstance(dimension, int) else expected
        for dimension, expected in zip(
            onnx_input.shape, EXPECTED_ONNX_INPUT_SHAPE, strict=True
        )
    ]
    if onnx_input_shape != EXPECTED_ONNX_INPUT_SHAPE:
        raise RuntimeError(
            "The pinned BiRefNet Lite export no longer has the expected "
            f"NCHW input {EXPECTED_ONNX_INPUT_SHAPE}; got {onnx_input.shape}."
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        raise FileExistsError(
            f"Refusing to overwrite {args.output}; choose another output path "
            "or remove that generated model yourself."
        )

    with tempfile.TemporaryDirectory(prefix="birefnet-lite-tflite-") as temp_name:
        temp_dir = Path(temp_name)
        converted_dir = temp_dir / "converted"
        subprocess.run(
            [
                onnx2tf,
                "-i",
                str(onnx_path),
                "-o",
                str(converted_dir),
                "-b",
                "1",
                "-kt",
                onnx_input_name,
            ],
            check=True,
        )

        requested_candidates = sorted(
            converted_dir.rglob(f"*_{args.precision}.tflite")
        )
        if not requested_candidates:
            found = [str(path) for path in converted_dir.rglob("*.tflite")]
            raise RuntimeError(
                f"onnx2tf completed without a {args.precision} TFLite model. "
                f"Models found: {found or 'none'}"
            )
        requested_model = requested_candidates[0]
        float32_candidates = sorted(converted_dir.rglob("*_float32.tflite"))
        if not float32_candidates:
            raise RuntimeError(
                "onnx2tf did not produce its float32 sibling model, which is "
                "needed for the CPU parity smoke test."
            )
        cpu_validation_model = float32_candidates[0]

        Interpreter = load_interpreter()
        cpu_interpreter = Interpreter(
            model_path=str(cpu_validation_model), num_threads=4
        )
        cpu_interpreter.allocate_tensors()
        cpu_input_details = cpu_interpreter.get_input_details()
        cpu_output_details = cpu_interpreter.get_output_details()
        if len(cpu_input_details) != 1 or len(cpu_output_details) != 1:
            raise RuntimeError(
                "Expected one image input and one mask output; got "
                f"{len(cpu_input_details)} inputs and "
                f"{len(cpu_output_details)} outputs."
            )

        cpu_input_shape = [int(value) for value in cpu_input_details[0]["shape"]]
        if cpu_input_shape not in (
            EXPECTED_ONNX_INPUT_SHAPE,
            [1, IMAGE_SIZE, IMAGE_SIZE, 3],
        ):
            raise RuntimeError(
                "Expected a fixed 1024x1024 RGB float32 TFLite input for CPU "
                f"validation, got {cpu_input_shape}."
            )
        onnx_dtype = tensor_dtype(onnx_input.type)
        probe = np.random.default_rng(7).normal(
            0.0, 1.0, size=onnx_input_shape
        ).astype(onnx_dtype)

        if cpu_input_shape == onnx_input_shape:
            tflite_probe = probe
        elif cpu_input_shape == [
            onnx_input_shape[0],
            onnx_input_shape[2],
            onnx_input_shape[3],
            onnx_input_shape[1],
        ]:
            tflite_probe = np.transpose(probe, (0, 2, 3, 1))
        else:
            raise RuntimeError(
                "TFLite input shape does not match the ONNX image input: "
                f"ONNX {onnx_input_shape}, TFLite {cpu_input_shape}."
            )
        tflite_probe = tflite_probe.astype(
            cpu_input_details[0]["dtype"], copy=False
        )

        cpu_interpreter.set_tensor(cpu_input_details[0]["index"], tflite_probe)
        cpu_interpreter.invoke()
        tflite_output = cpu_interpreter.get_tensor(
            cpu_output_details[0]["index"]
        )
        if not np.isfinite(tflite_output).all():
            raise RuntimeError(
                "The float32 TFLite sibling produced non-finite mask values."
            )

        onnx_output = reference.run(None, {onnx_input_name: probe})[0]
        onnx_plane = as_mask_plane(onnx_output)
        tflite_plane = as_mask_plane(tflite_output)
        if onnx_plane.shape != tflite_plane.shape:
            raise RuntimeError(
                "ONNX and TFLite mask sizes differ: "
                f"{onnx_plane.shape} versus {tflite_plane.shape}."
            )
        max_abs = float(np.max(np.abs(onnx_plane - tflite_plane)))
        mean_abs = float(np.mean(np.abs(onnx_plane - tflite_plane)))
        onnx_binary = onnx_plane >= 0
        tflite_binary = tflite_plane >= 0
        union = int(np.logical_or(onnx_binary, tflite_binary).sum())
        intersection = int(np.logical_and(onnx_binary, tflite_binary).sum())
        mask_iou = 1.0 if union == 0 else intersection / union

        if requested_model == cpu_validation_model:
            model_input_details = cpu_input_details
            model_output_details = cpu_output_details
        else:
            model_interpreter = Interpreter(
                model_path=str(requested_model), num_threads=4
            )
            model_interpreter.allocate_tensors()
            model_input_details = model_interpreter.get_input_details()
            model_output_details = model_interpreter.get_output_details()
            if len(model_input_details) != 1 or len(model_output_details) != 1:
                raise RuntimeError(
                    "Expected the requested model to have one image input and "
                    "one mask output."
                )

        tflite_shape = [int(value) for value in model_input_details[0]["shape"]]
        output_shape = [int(value) for value in model_output_details[0]["shape"]]
        if (
            tflite_shape != cpu_input_shape
            or output_shape
            != [int(value) for value in cpu_output_details[0]["shape"]]
        ):
            raise RuntimeError(
                "The requested precision has a different tensor contract from "
                "the CPU-validated float32 sibling."
            )

        args.output.write_bytes(requested_model.read_bytes())
        digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
        manifest = {
            "model": "BiRefNet_lite",
            "base_model": BASE_MODEL,
            "onnx_source": f"{MODEL_REPO}@{MODEL_REVISION}/{MODEL_FILENAME}",
            "license": "MIT",
            "converter": "onnx2tf",
            "precision": args.precision,
            "input": {
                "name": onnx_input_name,
                "onnx_shape": onnx_input_shape,
                "tflite_shape": tflite_shape,
                "tflite_dtype": str(model_input_details[0]["dtype"]),
                "layout": "NCHW" if tflite_shape[1] == 3 else "NHWC",
                "size": IMAGE_SIZE,
                "normalization": {
                    "scale": 1.0 / 255.0,
                    "mean": [0.485, 0.456, 0.406],
                    "std": [0.229, 0.224, 0.225],
                },
            },
            "output": {
                "name": model_output_details[0]["name"],
                "shape": output_shape,
                "dtype": str(model_output_details[0]["dtype"]),
                "meaning": "foreground logits; apply sigmoid for alpha",
            },
            "smoke_test": {
                "requested_model_precision": args.precision,
                "cpu_validated_model_precision": "float32",
                "random_input_max_abs_error": max_abs,
                "random_input_mean_abs_error": mean_abs,
                "threshold_zero_iou": mask_iou,
                "validated_with": (
                    "onnxruntime CPU and float32 TFLite CPU interpreter"
                ),
                "requested_float16_cpu_inference": (
                    "not run; validate the float16 model with the Android GPU "
                    "delegate on device"
                    if args.precision == "float16"
                    else "same float32 model was invoked on CPU"
                ),
            },
            "file": {
                "bytes": args.output.stat().st_size,
                "sha256": digest,
            },
        }
        args.output.with_suffix(".json").write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )

    print(f"TFLite output: {args.output}")
    print(f"TFLite bytes: {args.output.stat().st_size}")
    print(f"Requested model precision: {args.precision}")
    print("CPU parity smoke test model: float32")
    if args.precision == "float16":
        print(
            "Float16 inference needs a device GPU-delegate test; "
            "the Colab CPU smoke test validates its float32 sibling."
        )
    print(f"Mask output shape: {manifest['output']['shape']}")
    print(f"Random-input mask IoU at logit 0: {mask_iou:.6f}")
    print(f"Mean absolute logit error: {mean_abs:.6g}")
    print(f"SHA-256: {digest}")
    print(f"Manifest: {args.output.with_suffix('.json')}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Destination .tflite path; must not already exist.",
    )
    parser.add_argument(
        "--precision",
        choices=("float16", "float32"),
        default="float16",
        help="Choose the TFLite artifact produced by onnx2tf (default: float16).",
    )
    args = parser.parse_args()
    if args.output.suffix.lower() != ".tflite":
        raise SystemExit("--output must end with .tflite")
    convert(args)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, FileExistsError, subprocess.CalledProcessError) as exc:
        print(f"BiRefNet Lite conversion failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
