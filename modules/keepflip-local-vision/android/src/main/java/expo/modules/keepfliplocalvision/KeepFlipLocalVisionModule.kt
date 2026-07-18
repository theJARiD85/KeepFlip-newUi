package expo.modules.keepfliplocalvision

import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

private class LocalVisionException(message: String, cause: Throwable? = null) :
  CodedException("ERR_KEEPFLIP_LOCAL_VISION", message, cause)

class KeepFlipLocalVisionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KeepFlipLocalVision")

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
