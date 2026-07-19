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
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.opencv.android.OpenCVLoader

private class LocalVisionException(message: String, cause: Throwable? = null) :
  CodedException("ERR_KEEPFLIP_LOCAL_VISION", message, cause)

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
  private val subjectSegmenterDelegate = lazy {
    SubjectSegmentation.getClient(
      SubjectSegmenterOptions.Builder()
        .enableForegroundConfidenceMask()
        .build()
    )
  }
  private val subjectSegmenter: SubjectSegmenter by subjectSegmenterDelegate

  private val isOpenCvReady by lazy {
    OpenCVLoader.initLocal()
  }
  
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

  private fun yuv420ToNv21(
    width: Int,
    height: Int,
    y: ByteArray,
    u: ByteArray,
    v: ByteArray
  ): ByteArray {
    require(width > 0 && height > 0) { "Frame dimensions must be positive." }
    require(width % 2 == 0 && height % 2 == 0) { "YUV frame dimensions must be even." }

    val ySize = width * height
    val chromaWidth = width / 2
    val chromaHeight = height / 2
    val chromaSize = chromaWidth * chromaHeight
    require(y.size >= ySize) { "The Y plane is shorter than the frame dimensions require." }
    require(u.size >= chromaSize) { "The U plane is shorter than the frame dimensions require." }
    require(v.size >= chromaSize) { "The V plane is shorter than the frame dimensions require." }

    val nv21 = ByteArray(ySize + chromaWidth * chromaHeight * 2)
    y.copyInto(nv21, destinationOffset = 0, startIndex = 0, endIndex = ySize)

    for (row in 0 until chromaHeight) {
      for (column in 0 until chromaWidth) {
        val destinationIndex = ySize + (row * chromaWidth + column) * 2
        val sourceIndex = row * chromaWidth + column
        nv21[destinationIndex] = v[sourceIndex]
        nv21[destinationIndex + 1] = u[sourceIndex]
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
      if (subjectSegmenterDelegate.isInitialized()) {
        subjectSegmenter.close()
      }
    }

    AsyncFunction("detectYuvFrame") Coroutine {
        width: Int,
        height: Int,
        rotationDegrees: Int,
        y: ByteArray,
        u: ByteArray,
        v: ByteArray ->
      val normalizedRotation = ((rotationDegrees % 360) + 360) % 360
      val input = InputImage.fromByteArray(
        yuv420ToNv21(width, height, y, u, v),
        width,
        height,
        normalizedRotation,
        InputImage.IMAGE_FORMAT_NV21
      )

      val detectedObjects = withContext(Dispatchers.IO) {
        Tasks.await(liveObjectDetector.process(input))
      }

      detectedObjects.map { detectedObject ->
        mapOf(
          "trackingId" to detectedObject.trackingId,
          "boundingBox" to normalizedRawBoundingBox(
            detectedObject.boundingBox,
            normalizedRotation,
            width,
            height
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

    AsyncFunction("traceImage") Coroutine { sourceUri: String ->
      val context = appContext.reactContext
        ?: throw LocalVisionException("The Android application context is unavailable.")
      val startedAt = System.currentTimeMillis()
      val image = try {
        val parsedUri = if (sourceUri.contains("://")) {
          Uri.parse(sourceUri)
        } else {
          Uri.fromFile(File(sourceUri))
        }
        InputImage.fromFilePath(context, parsedUri)
      } catch (error: Throwable) {
        throw LocalVisionException(
          "KeepFlip could not open this image for subject outlining.",
          error
        )
      }

      val result = try {
        withContext(Dispatchers.IO) {
          Tasks.await(subjectSegmenter.initTask)
          Tasks.await(subjectSegmenter.process(image))
        }
      } catch (error: Throwable) {
        throw LocalVisionException(
          "KeepFlip could not separate the item from its background.",
          error
        )
      }

      val points = result.foregroundConfidenceMask?.let { mask ->
        withContext(Dispatchers.Default) {
          extractSubjectContour(mask, image.width, image.height)
        }
      } ?: emptyList()

      mapOf(
        "points" to points,
        "maskWidth" to image.width,
        "maskHeight" to image.height,
        "processingMs" to (System.currentTimeMillis() - startedAt).toDouble()
      )
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
