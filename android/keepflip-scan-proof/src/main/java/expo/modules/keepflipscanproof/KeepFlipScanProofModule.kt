package expo.modules.keepflipscanproof

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit

private const val MAX_BARCODES = 4
private const val MAX_TEXT_BLOCKS = 8
private const val MAX_TEXT_BLOCK_LENGTH = 160
private const val MAX_TEXT_LENGTH = 900
private const val RECOGNITION_TIMEOUT_SECONDS = 6L

private class ScanProofReadException(
  message: String,
  cause: Throwable? = null,
) : CodedException(message, cause)

/**
 * Reads only a captured still image. It deliberately never runs in the camera
 * frame pipeline, and its raw text stays on device unless a later flow asks for
 * a specific, consented share.
 */
class KeepFlipScanProofModule : Module() {
  private val recognitionExecutor = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("KeepFlipScanProof")

    AsyncFunction("inspectPhoto") { photoUri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(
          ScanProofReadException("KeepFlip could not access the current app context."),
        )
      } else {
        try {
          recognitionExecutor.execute {
            try {
              promise.resolve(inspectPhoto(context, photoUri))
            } catch (error: Throwable) {
              promise.reject(
                ScanProofReadException(
                  "KeepFlip could not read local item proof from this photo.",
                  error,
                ),
              )
            }
          }
        } catch (error: RejectedExecutionException) {
          promise.reject(
            ScanProofReadException("Local item proof is no longer available.", error),
          )
        }
      }
    }

    OnDestroy {
      recognitionExecutor.shutdownNow()
    }
  }

  private fun inspectPhoto(context: Context, photoUri: String): Map<String, Any> {
    val image = InputImage.fromFilePath(context, toUri(photoUri))
    val barcodeScanner = BarcodeScanning.getClient(barcodeOptions)
    val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    try {
      val barcodeValues = awaitOrNull(barcodeScanner.process(image))
        ?.mapNotNull { barcode -> compact(barcode.rawValue, 96) }
        ?.distinct()
        ?.take(MAX_BARCODES)
        .orEmpty()
      val textBlocks = awaitOrNull(textRecognizer.process(image))
        ?.textBlocks
        ?.mapNotNull { block -> compact(block.text, MAX_TEXT_BLOCK_LENGTH) }
        ?.distinct()
        ?.take(MAX_TEXT_BLOCKS)
        .orEmpty()

      return mapOf(
        "barcodes" to barcodeValues,
        "text" to compact(textBlocks.joinToString(" "), MAX_TEXT_LENGTH).orEmpty(),
        "textBlocks" to textBlocks,
      )
    } finally {
      barcodeScanner.close()
      textRecognizer.close()
    }
  }

  private fun toUri(value: String): Uri {
    val parsed = Uri.parse(value)
    return if (parsed.scheme.isNullOrBlank()) Uri.fromFile(File(value)) else parsed
  }

  private fun <T> awaitOrNull(task: Task<T>): T? =
    try {
      Tasks.await(task, RECOGNITION_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    } catch (_: Exception) {
      null
    }

  private fun compact(value: String?, maxLength: Int): String? {
    val normalized = value.orEmpty().replace(Regex("\\s+"), " ").trim()
    if (normalized.isEmpty()) return null
    return normalized.take(maxLength)
  }

  private val barcodeOptions = BarcodeScannerOptions.Builder()
    .setBarcodeFormats(
      Barcode.FORMAT_UPC_A,
      Barcode.FORMAT_UPC_E,
      Barcode.FORMAT_EAN_13,
      Barcode.FORMAT_EAN_8,
      Barcode.FORMAT_CODE_128,
      Barcode.FORMAT_CODE_39,
      Barcode.FORMAT_CODE_93,
      Barcode.FORMAT_CODABAR,
      Barcode.FORMAT_ITF,
      Barcode.FORMAT_QR_CODE,
      Barcode.FORMAT_DATA_MATRIX,
      Barcode.FORMAT_PDF417,
      Barcode.FORMAT_AZTEC,
    )
    .build()
}
