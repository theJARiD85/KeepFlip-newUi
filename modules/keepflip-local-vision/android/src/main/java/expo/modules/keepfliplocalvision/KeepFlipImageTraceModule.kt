package expo.modules.keepfliplocalvision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentationResult
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.nio.FloatBuffer
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sqrt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.opencv.android.OpenCVLoader

private class KeepFlipImageTraceException(message: String, cause: Throwable? = null) :
  CodedException("ERR_KEEPFLIP_IMAGE_TRACE", message, cause)

private data class ImageTraceSubjectCandidate(
  val startX: Int,
  val startY: Int,
  val width: Int,
  val height: Int,
  val confidenceMask: FloatBuffer,
  val centerConfidence: Float,
  val distanceSquared: Double
) {
  val area: Int
    get() = width * height
}

class KeepFlipImageTraceModule : Module() {
  private val isOpenCvReady by lazy {
    OpenCVLoader.initLocal()
  }

  private val subjectSegmenterDelegate = lazy {
    val subjectResultOptions =
      SubjectSegmenterOptions.SubjectResultOptions.Builder()
        .enableConfidenceMask()
        .build()

    SubjectSegmentation.getClient(
      SubjectSegmenterOptions.Builder()
        .enableMultipleSubjects(subjectResultOptions)
        .build()
    )
  }

  private val subjectSegmenter: SubjectSegmenter by subjectSegmenterDelegate

  override fun definition() = ModuleDefinition {
    Name("KeepFlipImageTrace")

    OnDestroy {
      if (subjectSegmenterDelegate.isInitialized()) {
        subjectSegmenter.close()
      }
    }

    AsyncFunction("traceCenteredSubjectImage") Coroutine {
        sourceUri: String,
        lowThreshold: Double,
        highThreshold: Double ->
      if (!isOpenCvReady) {
        throw KeepFlipImageTraceException("OpenCV could not initialize on this device.")
      }

      val context = appContext.reactContext
        ?: throw KeepFlipImageTraceException("The Android application context is unavailable.")
      val startedAt = System.nanoTime()

      val bitmap = try {
        withContext(Dispatchers.IO) {
          loadScaledBitmap(context, sourceUri)
        }
      } catch (error: Throwable) {
        throw KeepFlipImageTraceException("KeepFlip could not open the captured image.", error)
      }

      try {
        val segmentationResult = try {
          withContext(Dispatchers.IO) {
            Tasks.await(subjectSegmenter.initTask)
            Tasks.await(subjectSegmenter.process(InputImage.fromBitmap(bitmap, 0)))
          }
        } catch (error: Throwable) {
          throw KeepFlipImageTraceException(
            "KeepFlip could not separate the centered item from its background.",
            error
          )
        }

        val subjectMask = withContext(Dispatchers.Default) {
          selectCenteredSubjectMask(
            result = segmentationResult,
            frameWidth = bitmap.width,
            frameHeight = bitmap.height
          )
        }

        if (subjectMask == null) {
          return@Coroutine mapOf(
            "width" to 1,
            "height" to 1,
            "pixels" to ByteArray(1),
            "processingMs" to (System.nanoTime() - startedAt) / 1_000_000.0,
            "subjectFound" to false
          )
        }

        val luminance = withContext(Dispatchers.Default) {
          bitmapToLuminance(bitmap)
        }

        val edgeResult = try {
          withContext(Dispatchers.Default) {
            CannyEdgeDetector.detect(
              yPlane = luminance,
              width = bitmap.width,
              height = bitmap.height,
              yRowStride = bitmap.width,
              lowThreshold = lowThreshold,
              highThreshold = highThreshold
            )
          }
        } catch (error: Throwable) {
          throw KeepFlipImageTraceException("KeepFlip could not trace the centered item.", error)
        }

        val pixels = withContext(Dispatchers.Default) {
          applySubjectMask(
            edgeResult = edgeResult,
            subjectMask = subjectMask,
            maskWidth = bitmap.width,
            maskHeight = bitmap.height
          )
        }

        mapOf(
          "width" to edgeResult.width,
          "height" to edgeResult.height,
          "pixels" to pixels,
          "processingMs" to (System.nanoTime() - startedAt) / 1_000_000.0,
          "subjectFound" to true
        )
      } finally {
        bitmap.recycle()
      }
    }
  }

  private fun loadScaledBitmap(context: Context, source: String): Bitmap {
    val uri = if (source.contains("://")) Uri.parse(source) else Uri.fromFile(File(source))
    val decoded = decodeBitmap(context, uri)
      ?: throw IllegalArgumentException("The captured image could not be decoded.")

    val argb = if (decoded.config == Bitmap.Config.ARGB_8888) {
      decoded
    } else {
      decoded.copy(Bitmap.Config.ARGB_8888, false).also { decoded.recycle() }
    }

    val longestEdge = max(argb.width, argb.height)
    if (longestEdge <= TRACE_INPUT_MAX_EDGE) return argb

    val scale = TRACE_INPUT_MAX_EDGE.toDouble() / longestEdge.toDouble()
    val targetWidth = max(1, (argb.width * scale).roundToInt())
    val targetHeight = max(1, (argb.height * scale).roundToInt())

    return Bitmap.createScaledBitmap(argb, targetWidth, targetHeight, true).also {
      if (it !== argb) argb.recycle()
    }
  }

  private fun decodeBitmap(context: Context, uri: Uri): Bitmap? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val source = if (uri.scheme.equals("file", ignoreCase = true)) {
        val path = uri.path ?: throw IllegalArgumentException("The image file path is missing.")
        ImageDecoder.createSource(File(path))
      } else {
        ImageDecoder.createSource(context.contentResolver, uri)
      }

      ImageDecoder.decodeBitmap(source) { decoder, _, _ ->
        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        decoder.isMutableRequired = false
      }
    } else {
      val stream = if (uri.scheme.equals("file", ignoreCase = true)) {
        val path = uri.path ?: throw IllegalArgumentException("The image file path is missing.")
        FileInputStream(File(path))
      } else {
        context.contentResolver.openInputStream(uri)
      }

      stream?.use { BitmapFactory.decodeStream(it) }
    }
  }

  private fun bitmapToLuminance(bitmap: Bitmap): ByteArray {
    val width = bitmap.width
    val height = bitmap.height
    val colors = IntArray(width * height)
    bitmap.getPixels(colors, 0, width, 0, 0, width, height)

    val output = ByteArray(colors.size)
    for (index in colors.indices) {
      val color = colors[index]
      val red = color shr 16 and 0xff
      val green = color shr 8 and 0xff
      val blue = color and 0xff
      output[index] = ((77 * red + 150 * green + 29 * blue) shr 8).toByte()
    }
    return output
  }

  private fun centerDistanceSquared(
    centerX: Int,
    centerY: Int,
    startX: Int,
    startY: Int,
    width: Int,
    height: Int
  ): Double {
    val endX = startX + width - 1
    val endY = startY + height - 1
    val dx = when {
      centerX < startX -> (startX - centerX).toDouble()
      centerX > endX -> (centerX - endX).toDouble()
      else -> 0.0
    }
    val dy = when {
      centerY < startY -> (startY - centerY).toDouble()
      centerY > endY -> (centerY - endY).toDouble()
      else -> 0.0
    }
    return dx * dx + dy * dy
  }

  private fun selectCenteredSubjectMask(
    result: SubjectSegmentationResult,
    frameWidth: Int,
    frameHeight: Int
  ): ByteArray? {
    val centerX = frameWidth / 2
    val centerY = frameHeight / 2

    val candidates = result.subjects.mapNotNull { subject ->
      val subjectWidth = subject.width
      val subjectHeight = subject.height
      if (subjectWidth <= 0 || subjectHeight <= 0) return@mapNotNull null

      val sourceMask = subject.confidenceMask ?: return@mapNotNull null
      val mask = sourceMask.duplicate()
      val localCenterX = centerX - subject.startX
      val localCenterY = centerY - subject.startY
      val centerConfidence =
        if (localCenterX in 0 until subjectWidth && localCenterY in 0 until subjectHeight) {
          mask.get(localCenterY * subjectWidth + localCenterX)
        } else {
          0f
        }

      ImageTraceSubjectCandidate(
        startX = subject.startX,
        startY = subject.startY,
        width = subjectWidth,
        height = subjectHeight,
        confidenceMask = mask,
        centerConfidence = centerConfidence,
        distanceSquared = centerDistanceSquared(
          centerX,
          centerY,
          subject.startX,
          subject.startY,
          subjectWidth,
          subjectHeight
        )
      )
    }

    val selected = candidates.sortedWith(
      compareByDescending<ImageTraceSubjectCandidate> {
        it.centerConfidence >= CENTER_HIT_CONFIDENCE
      }
        .thenByDescending { it.centerConfidence }
        .thenBy { it.distanceSquared }
        .thenByDescending { it.area }
    ).firstOrNull() ?: return null

    val maximumDistance =
      hypot(frameWidth.toDouble(), frameHeight.toDouble()) * MAXIMUM_CENTER_DISTANCE_FRACTION

    if (
      selected.centerConfidence < MINIMUM_CENTER_CONFIDENCE &&
      sqrt(selected.distanceSquared) > maximumDistance
    ) {
      return null
    }

    val fullMask = ByteArray(frameWidth * frameHeight)
    val confidenceMask = selected.confidenceMask.duplicate()
    confidenceMask.rewind()

    for (localY in 0 until selected.height) {
      for (localX in 0 until selected.width) {
        val confidence = confidenceMask.get()
        val globalX = selected.startX + localX
        val globalY = selected.startY + localY

        if (
          confidence >= SUBJECT_MASK_CONFIDENCE &&
          globalX in 0 until frameWidth &&
          globalY in 0 until frameHeight
        ) {
          fullMask[globalY * frameWidth + globalX] =
            (confidence * 255f).roundToInt().coerceIn(0, 255).toByte()
        }
      }
    }

    return fullMask
  }

  private fun applySubjectMask(
    edgeResult: CannyEdgeResult,
    subjectMask: ByteArray,
    maskWidth: Int,
    maskHeight: Int
  ): ByteArray {
    val outputWidth = edgeResult.width
    val outputHeight = edgeResult.height
    val inside = BooleanArray(outputWidth * outputHeight)
    val output = ByteArray(outputWidth * outputHeight)

    for (outputY in 0 until outputHeight) {
      val sourceY = ((outputY + 0.5) * maskHeight / outputHeight)
        .toInt().coerceIn(0, maskHeight - 1)

      for (outputX in 0 until outputWidth) {
        val sourceX = ((outputX + 0.5) * maskWidth / outputWidth)
          .toInt().coerceIn(0, maskWidth - 1)
        val outputIndex = outputY * outputWidth + outputX
        val confidence = subjectMask[sourceY * maskWidth + sourceX].toInt() and 0xff
        val isInside = confidence >= DOWNSAMPLED_MASK_THRESHOLD

        inside[outputIndex] = isInside
        if (isInside) output[outputIndex] = edgeResult.pixels[outputIndex]
      }
    }

    for (y in 0 until outputHeight) {
      for (x in 0 until outputWidth) {
        val index = y * outputWidth + x
        if (!inside[index]) continue

        val touchesBackground =
          x == 0 ||
            y == 0 ||
            x == outputWidth - 1 ||
            y == outputHeight - 1 ||
            !inside[index - 1] ||
            !inside[index + 1] ||
            !inside[index - outputWidth] ||
            !inside[index + outputWidth]

        if (touchesBackground) output[index] = 0xff.toByte()
      }
    }

    return output
  }

  private companion object {
    const val TRACE_INPUT_MAX_EDGE = 768
    const val CENTER_HIT_CONFIDENCE = 0.28f
    const val MINIMUM_CENTER_CONFIDENCE = 0.10f
    const val SUBJECT_MASK_CONFIDENCE = 0.34f
    const val DOWNSAMPLED_MASK_THRESHOLD = 86
    const val MAXIMUM_CENTER_DISTANCE_FRACTION = 0.30
  }
}
