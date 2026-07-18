package expo.modules.keepfliplocalvision

import android.net.Uri
import android.graphics.Rect
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.objects.ObjectDetection
import com.google.mlkit.vision.objects.ObjectDetector
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File

private class LocalVisionException(message: String, cause: Throwable? = null) :
  CodedException("ERR_KEEPFLIP_LOCAL_VISION", message, cause)

private class KeepFlipYuvFrameRecord : Record {
  @Field var width: Int = 0
  @Field var height: Int = 0
  @Field var rotationDegrees: Int = 0
  @Field var y: ByteArray = byteArrayOf()
  @Field var u: ByteArray = byteArrayOf()
  @Field var v: ByteArray = byteArrayOf()
  @Field var yRowStride: Int = 0
  @Field var uRowStride: Int = 0
  @Field var vRowStride: Int = 0
  @Field var uPixelStride: Int = 0
  @Field var vPixelStride: Int = 0
}

class KeepFlipLocalVisionModule : Module() {
  private val liveObjectDetectorDelegate = lazy {
    ObjectDetection.getClient(
      ObjectDetectorOptions.Builder()
        .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)
        .enableMultipleObjects()
        .enableClassification()
        .build()
    )
  }
  private val liveObjectDetector: ObjectDetector by liveObjectDetectorDelegate

  private fun normalizedRawBoundingBox(
    box: Rect,
    rotationDegrees: Int,
    rawWidth: Int,
    rawHeight: Int
  ): Map<String, Double> {
    val left = box.left.toDouble()
    val top = box.top.toDouble()
    val right = box.right.toDouble()
    val bottom = box.bottom.toDouble()

    val raw = when (((rotationDegrees % 360) + 360) % 360) {
      90 -> doubleArrayOf(top, rawHeight - right, bottom, rawHeight - left)
      180 -> doubleArrayOf(rawWidth - right, rawHeight - bottom, rawWidth - left, rawHeight - top)
      270 -> doubleArrayOf(rawWidth - bottom, left, rawWidth - top, right)
      else -> doubleArrayOf(left, top, right, bottom)
    }

    val x0 = raw[0].coerceIn(0.0, rawWidth.toDouble())
    val y0 = raw[1].coerceIn(0.0, rawHeight.toDouble())
    val x1 = raw[2].coerceIn(x0, rawWidth.toDouble())
    val y1 = raw[3].coerceIn(y0, rawHeight.toDouble())

    return mapOf(
      "x" to (x0 / rawWidth),
      "y" to (y0 / rawHeight),
      "width" to ((x1 - x0) / rawWidth),
      "height" to ((y1 - y0) / rawHeight)
    )
  }

  private fun yuv420ToNv21(frame: KeepFlipYuvFrameRecord): ByteArray {
    require(frame.width > 0 && frame.height > 0) { "Frame dimensions must be positive." }
    require(frame.yRowStride > 0 && frame.uRowStride > 0 && frame.vRowStride > 0) {
      "Frame row strides must be positive."
    }
    require(frame.uPixelStride > 0 && frame.vPixelStride > 0) {
      "Frame pixel strides must be positive."
    }

    val ySize = frame.width * frame.height
    val chromaWidth = (frame.width + 1) / 2
    val chromaHeight = (frame.height + 1) / 2
    val nv21 = ByteArray(ySize + chromaWidth * chromaHeight * 2)

    for (row in 0 until frame.height) {
      val sourceRow = row * frame.yRowStride
      val destinationRow = row * frame.width
      for (column in 0 until frame.width) {
        val sourceIndex = sourceRow + column
        if (sourceIndex < frame.y.size) {
          nv21[destinationRow + column] = frame.y[sourceIndex]
        }
      }
    }

    for (row in 0 until chromaHeight) {
      for (column in 0 until chromaWidth) {
        val destinationIndex = ySize + (row * chromaWidth + column) * 2
        val vIndex = row * frame.vRowStride + column * frame.vPixelStride
        val uIndex = row * frame.uRowStride + column * frame.uPixelStride
        if (vIndex < frame.v.size) nv21[destinationIndex] = frame.v[vIndex]
        if (uIndex < frame.u.size) nv21[destinationIndex + 1] = frame.u[uIndex]
      }
    }

    return nv21
  }

  override fun definition() = ModuleDefinition {
    Name("KeepFlipLocalVision")

    OnDestroy {
      if (liveObjectDetectorDelegate.isInitialized()) {
        liveObjectDetector.close()
      }
    }

    AsyncFunction("detectYuvFrame") Coroutine { frame: KeepFlipYuvFrameRecord ->
      val input = InputImage.fromByteArray(
        yuv420ToNv21(frame),
        frame.width,
        frame.height,
        ((frame.rotationDegrees % 360) + 360) % 360,
        InputImage.IMAGE_FORMAT_NV21
      )

      Tasks.await(liveObjectDetector.process(input)).map { detectedObject ->
        mapOf(
          "trackingId" to detectedObject.trackingId,
          "boundingBox" to normalizedRawBoundingBox(
            detectedObject.boundingBox,
            frame.rotationDegrees,
            frame.width,
            frame.height
          ),
          "labels" to detectedObject.labels.map { label ->
            mapOf(
              "text" to label.text,
              "confidence" to label.confidence.toDouble(),
              "index" to label.index
            )
          }
        )
      }
    }

    AsyncFunction("analyzeImage") { sourceUri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(LocalVisionException("The Android application context is unavailable."))
        return@AsyncFunction
      }

      val startedAt = System.currentTimeMillis()
      val image = try {
        val parsedUri = if (sourceUri.contains("://")) {
          Uri.parse(sourceUri)
        } else {
          Uri.fromFile(File(sourceUri))
        }
        InputImage.fromFilePath(context, parsedUri)
      } catch (error: Throwable) {
        promise.reject(LocalVisionException("KeepFlip could not open this image for on-device analysis.", error))
        return@AsyncFunction
      }

      val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      val labeler = ImageLabeling.getClient(
        ImageLabelerOptions.Builder()
          .setConfidenceThreshold(0.45f)
          .build()
      )
      val barcodeScanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder()
          .setBarcodeFormats(
            Barcode.FORMAT_UPC_A,
            Barcode.FORMAT_UPC_E,
            Barcode.FORMAT_EAN_13,
            Barcode.FORMAT_EAN_8,
            Barcode.FORMAT_CODE_128,
            Barcode.FORMAT_CODE_39,
            Barcode.FORMAT_CODE_93,
            Barcode.FORMAT_ITF,
            Barcode.FORMAT_QR_CODE,
            Barcode.FORMAT_DATA_MATRIX
          )
          .build()
      )

      val textTask = textRecognizer.process(image)
      val labelTask = labeler.process(image)
      val barcodeTask = barcodeScanner.process(image)

      Tasks.whenAllComplete(textTask, labelTask, barcodeTask)
        .addOnCompleteListener {
          try {
            val textResult = if (textTask.isSuccessful) textTask.result else null
            val lines = textResult?.textBlocks
              ?.flatMap { block -> block.lines.map { line -> line.text.trim() } }
              ?.filter { it.isNotEmpty() }
              ?.distinct()
              ?.take(80)
              ?: emptyList()

            val labels = if (labelTask.isSuccessful) {
              labelTask.result
                .sortedByDescending { it.confidence }
                .take(12)
                .map { label ->
                  mapOf(
                    "text" to label.text,
                    "confidence" to label.confidence.toDouble(),
                    "index" to label.index
                  )
                }
            } else {
              emptyList()
            }

            val barcodes = if (barcodeTask.isSuccessful) {
              barcodeTask.result
                .mapNotNull { barcode ->
                  val rawValue = barcode.rawValue?.trim().orEmpty()
                  val displayValue = barcode.displayValue?.trim().orEmpty()
                  if (rawValue.isEmpty() && displayValue.isEmpty()) {
                    null
                  } else {
                    mapOf(
                      "rawValue" to rawValue,
                      "displayValue" to displayValue,
                      "format" to barcode.format,
                      "valueType" to barcode.valueType
                    )
                  }
                }
                .take(8)
            } else {
              emptyList()
            }

            val warnings = buildList {
              if (!textTask.isSuccessful) add("ocr_unavailable")
              if (!labelTask.isSuccessful) add("image_labels_unavailable")
              if (!barcodeTask.isSuccessful) add("barcode_scan_unavailable")
            }

            promise.resolve(
              mapOf(
                "text" to (textResult?.text?.trim() ?: ""),
                "lines" to lines,
                "labels" to labels,
                "barcodes" to barcodes,
                "warnings" to warnings,
                "processingMs" to (System.currentTimeMillis() - startedAt).toDouble()
              )
            )
          } catch (error: Throwable) {
            promise.reject(LocalVisionException("On-device analysis could not finish.", error))
          } finally {
            textRecognizer.close()
            labeler.close()
            barcodeScanner.close()
          }
        }
    }
  }
}
