# BiRefNet Lite TFLite conversion

This conversion uses the MIT ONNX export whose model card identifies
`ZhengPeng7/BiRefNet_lite` as its base model. The source revision is pinned in
`export_birefnet_lite_tflite.py`. No training or fine-tuning is involved.

The initial `flatbuffer_direct` conversion wrote TFLite files, but the CPU
interpreter rejected the float32 model because an integer `MINIMUM` operation
had mismatched `INT64` and `INT32` inputs. Inspection found this mismatch at
80 integer `Clip` sites: the ONNX bounds are `INT64`, while onnx2tf 2.6.9's
direct output used `INT32` for the Clip input and bounds but kept its output
`INT64`. Switching to `tf_converter` passed that point but consumed about
50.5 million kB of resident memory and was terminated by Colab's
`/jupyter-children` cgroup OOM killer. Do not repeat that backend in the
roughly 51 GB high-RAM profile.

The exporter defaults to `flatbuffer_direct` and makes an isolated copy of
onnx2tf 2.6.9 in its conversion directory. It repairs integer Clip lowering
there, without changing the installed package. It invokes the float32 model
on Colab CPU, checks its output against ONNX Runtime, and reads the float16
model's static tensor contract without allocating unsupported CPU kernels.
Use `--keep-converted-dir` during diagnosis so raw output remains available
if validation fails. A generated file is not considered validated until the
exporter completes with exit code 0 and writes both the requested model and
its manifest.

One Colab run with the same isolated Clip repair produced a 121,360,940-byte
float16 model. Its float32 sibling had mask IoU 1.0 at logit threshold zero,
maximum absolute logit error 0.000112, and mean absolute logit error 0.00000916
against ONNX Runtime on a seeded random input. The float16 model has not yet
been invoked with an Android GPU delegate or tested on real photos.

## Run from Colab

The ONNX graph is about 224 MB. Run the conversion in Colab rather than on a
low-memory developer machine. Start from a clean Colab runtime. If a previous
install left package versions mismatched, choose **Runtime > Disconnect and
delete runtime**, reconnect, then add a code cell to the BiRefNet notebook.
This resets temporary runtime files, so upload the exporter again after setup.

Install the converter and its validation tools with the versions used by
onnx2tf 2.6.9:

```python
%pip install -q "onnx2tf[tensorflow]==2.6.9" "numpy==2.2.6" "protobuf==7.35.1" huggingface_hub
```

This installs the optional TensorFlow Lite Converter dependencies as well as
onnx2tf's pinned NumPy, Protobuf, ONNX Runtime, and LiteRT packages. The
notebook already selected Python 3.13, which this converter version supports.
After installation finishes, choose **Runtime > Restart session** before
importing TensorFlow. A resolver warning about Colab's preinstalled `ydf`
requiring protobuf below version 7 is expected; `ydf` is not used by this
converter. Verify the package imports before conversion:

```python
import importlib.metadata as metadata
import google.protobuf
import numpy

print("onnx2tf:", metadata.version("onnx2tf"))
print("NumPy package/loaded:", metadata.version("numpy"), numpy.__version__)
print("Protobuf package/loaded:", metadata.version("protobuf"), google.protobuf.__version__)

import tensorflow as tf
print("TensorFlow:", tf.__version__)
```

The package and loaded NumPy/Protobuf versions should match, and TensorFlow
should import without an exception.

Upload `export_birefnet_lite_tflite.py` from this folder with Colab's file
picker, then run:

```python
!python /content/export_birefnet_lite_tflite.py \
  --output /content/birefnet_lite_float16.tflite \
  --precision float16 \
  --tflite-backend flatbuffer_direct \
  --keep-converted-dir /content/birefnet_lite_direct_raw
```

The script downloads the pinned ONNX export and converts it using
`flatbuffer_direct` by default. If validation fails, it leaves raw converter
outputs under `/content/birefnet_lite_direct_raw/converted`; the requested
output and manifest are not copied. Do not install an unvalidated raw
file in the app. The ONNX model input is NCHW
(`[1, 3, 1024, 1024]`), so the exporter lets onnx2tf perform its normal
channel-last conversion. Do not add `-kt input_image`: onnx2tf defines `-kt`
as preserving an already-NHWC input, which mislabels this model's NCHW input
and causes later decoder tensor dimensions to disagree. The exporter also
includes targeted axis replacements for the decoder splits whose converted
axes are misidentified: the converter trace showed it attempting to divide a
dimension of size 3 into 32 pieces, while the intended split is the dimension
of size 1024. It invokes the
float32 TFLite sibling on CPU and compares that mask to ONNX Runtime. The
source graph has 61 decoder `Split` nodes whose ONNX axis is the second-last
dimension: `Split_1` through `Split_32`, `Split_34` through `Split_49`,
`Split_51` through `Split_58`,
`Split_60` through `Split_63`, and `Split_65`. Their rank-three tensors have
source shape `[3, 1024, width]`; after onnx2tf's layout conversion, the
corresponding tensors are `[1024, width, 3]`, so their split axis must be 0.
The exporter applies that correction to the full set instead of fixing only
the first decoder nodes encountered at runtime. The float16 model is packaged
for the Android GPU test, and its input/output tensor contract is checked.
The Colab CPU interpreter cannot execute this converted float16 model's
convolution, so this smoke test does not establish float16 GPU runtime
compatibility. The app test must verify that on a phone. A JSON
manifest beside the TFLite file records the tensor shapes, precision, parity
results, license, and SHA-256.

The upload cell from earlier notebook versions checks for literal source text
such as `"op_name": "wa/decoder/Split_1"`. The exporter generates these names
from an f-string, so that exact-text assertion fails even when the corrected
split list is present. Check for the generated-name expression instead:

```python
from pathlib import Path

script_text = Path("/content/export_birefnet_lite_tflite.py").read_text(encoding="utf-8")
assert '"op_name": f"wa/decoder/Split_{split_index}"' in script_text
assert "SPLITS_WITH_CHANNEL_LAST_AXIS_BUG" in script_text
assert "--keep-converted-dir" in script_text
print("Updated diagnostic exporter loaded")
```

If the phone's GPU delegate cannot run the float16 artifact, create a larger
float32 diagnostic artifact by running the same command with
`--precision float32` and output filename
`/content/birefnet_lite_float32.tflite`.

Download the model and its manifest from Colab. These two calls open the
browser download prompts:

```python
from google.colab import files

files.download("/content/birefnet_lite_float16.tflite")
files.download("/content/birefnet_lite_float16.json")
```

Attach both files in this chat. They can then be installed under
`assets/models/` for the device test. Keep the current YOLO model while the
BiRefNet test is in progress so both results remain available for comparison.

## Inference contract

- Input size: 1024 × 1024 RGB.
- Preprocessing: convert RGB to 0..1 and normalize with ImageNet mean and
  standard deviation.
- Output: foreground logits. Apply sigmoid to produce the soft mask.
- Select the mask component under the user's tap for AR; the model itself is
  still an image-only model.
