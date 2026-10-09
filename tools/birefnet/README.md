# BiRefNet Lite TFLite conversion

This conversion uses the MIT ONNX export whose model card identifies
`ZhengPeng7/BiRefNet_lite` as its base model. The source revision is pinned in
`export_birefnet_lite_tflite.py`. No training or fine-tuning is involved.

The first attempt used onnx2tf's default `flatbuffer_direct` backend. It wrote
TFLite files, but the CPU interpreter rejected an integer `MINIMUM` operation
at runtime. This exporter now selects onnx2tf's TensorFlow Lite Converter
compatibility backend instead, which the converter's migration guide
recommends for compatibility cases.

## Run from Colab

The ONNX graph is about 224 MB. Run the conversion in Colab rather than on a
low-memory developer machine. In the BiRefNet notebook, add a code cell and
install the converter and its validation tools:

```python
%pip install -q "onnx2tf[tensorflow]==2.6.9" huggingface_hub
```

This installs the optional TensorFlow Lite Converter dependencies as well as
onnx2tf's pinned ONNX Runtime and LiteRT packages. The notebook already
selected Python 3.13, which this converter version supports. Restart the Colab
session if it prompts you to do so, then reupload the exporter if it is no
longer listed in `/content`.

Upload `export_birefnet_lite_tflite.py` from this folder with Colab's file
picker, then run:

```python
!python /content/export_birefnet_lite_tflite.py \
  --output /content/birefnet_lite_float16.tflite \
  --precision float16
```

The script downloads the pinned ONNX export and converts it using the
`tf_converter` compatibility backend. It invokes the
float32 TFLite sibling on CPU and compares that mask to ONNX Runtime. The
float16 model is packaged for the Android GPU test, and its input/output tensor
contract is checked. The Colab CPU interpreter cannot execute this converted
float16 model's convolution, so this smoke test does not establish float16 GPU
runtime compatibility. The app test must verify that on a phone. A JSON
manifest beside the TFLite file records the tensor shapes, precision, parity
results, license, and SHA-256.

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
