package expo.modules.keepfliplocalvision

import android.graphics.Bitmap
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
import java.nio.FloatBuffer
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sqrt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.opencv.android.OpenCVLoader

private class KeepFlipCannyException(message: String, cause: Throwable? = null) :
  CodedException("ERR_KEEPFLIP_CANNY", message, cause)

private data class SubjectCandidate(
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

class KeepFlipCannyModule : Module() {
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

  private fun packYPlane(
    yPlane: ByteArray,
    width: Int,
    height: Int,
    rowStride: Int
  ): ByteArray {
    require(width > 0 && height > 0) { "Frame dimensions must be positive." }
    require(rowStride >= width) { "The Y row stride is smaller than the frame width." }
    require(yPlane.size >= rowStride * height) { "The Y plane is incomplete." }

    val packed = ByteArray(width * height)
    for (row in 0 until height) {
      System.arraycopy(
        yPlane,
        row * rowStride,
        packed,
        row * width,
        width
      )
    }
    return packed
  }

  private fun grayscaleBitmap(
    packedY: ByteArray,
    width: Int,
    height: Int
  ): Bitmap {
    val colors = IntArray(width * height)
    for (index in packedY.indices) {
      val luminance = packedY[index].toInt() and 0xff
      colors[index] =
        0xff000000.toInt() or
          (luminance shl 16) or
          (luminance shl 8) or
          luminance
    }

    return Bitmap.createBitmap(
      colors,
      width,
      height,
      Bitmap.Config.ARGB_8888
    )
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
      if (subjectWidth <= 0 || subjectHeight <= 0) {
        return@mapNotNull null
      }

      val sourceMask = subject.confidenceMask ?: return@mapNotNull null
      val mask = sourceMask.duplicate()
      val localCenterX = centerX - subject.startX
      val localCenterY = centerY - subject.startY
      val centerConfidence =
        if (
          localCenterX in 0 until subjectWidth &&
          localCenterY in 0 until subjectHeight
        ) {
          mask.get(localCenterY * subjectWidth + localCenterX)
        } else {
          0f
        }

      SubjectCandidate(
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
      compareByDescending<SubjectCandidate> {
        it.centerConfidence >= CENTER_HIT_CONFIDENCE
      }
        .thenByDescending { it.centerConfidence }
        .thenBy { it.distanceSquared }
        .thenByDescending { it.area }
    ).firstOrNull() ?: return null

    val maximumDistance =
      hypot(frameWidth.toDouble(), frameHeight.toDouble()) *
        MAXIMUM_CENTER_DISTANCE_FRACTION

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
      val sourceY = (
        (outputY + 0.5) * maskHeight.toDouble() / outputHeight.toDouble()
      ).toInt().coerceIn(0, maskHeight - 1)

      for (outputX in 0 until outputWidth) {
        val sourceX = (
          (outputX + 0.5) * maskWidth.toDouble() / outputWidth.toDouble()
        ).toInt().coerceIn(0, maskWidth - 1)

        val outputIndex = outputY * outputWidth + outputX
        val confidence =
          subjectMask[sourceY * maskWidth + sourceX].toInt() and 0xff
        val isInside = confidence >= DOWNSAMPLED_MASK_THRESHOLD

        inside[outputIndex] = isInside
        if (isInside) {
          output[outputIndex] = edgeResult.pixels[outputIndex]
        }
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

        if (touchesBackground) {
          output[index] = 0xff.toByte()
        }
      }
    }

    return output
  }

  override fun definition() = ModuleDefinition {
    Name("KeepFlipCanny")

    OnDestroy {
      if (subjectSegmenterDelegate.isInitialized()) {
        subjectSegmenter.close()
      }
    }

    AsyncFunction("detectYPlane") Coroutine {
        width: Int,
        height: Int,
        rowStride: Int,
        yPlane: ByteArray,
        lowThreshold: Double,
        highThreshold: Double ->
      if (!isOpenCvReady) {
        throw KeepFlipCannyException("OpenCV could not initialize on this device.")
      }

      val result = try {
        withContext(Dispatchers.Default) {
          CannyEdgeDetector.detect(
            yPlane = yPlane,
            width = width,
            height = height,
            yRowStride = rowStride,
            lowThreshold = lowThreshold,
            highThreshold = highThreshold
          )
        }
      } catch (error: Throwable) {
        throw KeepFlipCannyException("KeepFlip could not trace this camera frame.", error)
      }

      mapOf(
        "width" to result.width,
        "height" to result.height,
        "pixels" to result.pixels,
        "processingMs" to result.processingMs,
        "subjectFound" to true
      )
    }

    AsyncFunction("detectCenteredSubjectYPlane") Coroutine {
        width: Int,
        height: Int,
        rowStride: Int,
        yPlane: ByteArray,
        lowThreshold: Double,
        highThreshold: Double ->
      if (!isOpenCvReady) {
        throw KeepFlipCannyException("OpenCV could not initialize on this device.")
      }

      val startedAt = System.nanoTime()
      val packedY = try {
        withContext(Dispatchers.Default) {
          packYPlane(yPlane, width, height, rowStride)
        }
      } catch (error: Throwable) {
        throw KeepFlipCannyException("KeepFlip could not read this camera frame.", error)
      }

      val bitmap = withContext(Dispatchers.Default) {
        grayscaleBitmap(packedY, width, height)
      }

      val segmentationResult = try {
        withContext(Dispatchers.IO) {
          Tasks.await(subjectSegmenter.initTask)
          Tasks.await(
            subjectSegmenter.process(
              InputImage.fromBitmap(bitmap, 0)
            )
          )
        }
      } catch (error: Throwable) {
        throw KeepFlipCannyException(
          "KeepFlip could not isolate the centered item.",
          error
        )
      } finally {
        bitmap.recycle()
      }

      val subjectMask = withContext(Dispatchers.Default) {
        selectCenteredSubjectMask(
          segmentationResult,
          width,
          height
        )
      }

      val edgeResult = try {
        withContext(Dispatchers.Default) {
          CannyEdgeDetector.detect(
            yPlane = packedY,
            width = width,
            height = height,
            yRowStride = width,
            lowThreshold = lowThreshold,
            highThreshold = highThreshold
          )
        }
      } catch (error: Throwable) {
        throw KeepFlipCannyException(
          "KeepFlip could not trace the centered item.",
          error
        )
      }

      val subjectFound = subjectMask != null
      val pixels =
        if (subjectMask == null) {
          ByteArray(edgeResult.width * edgeResult.height)
        } else {
          withContext(Dispatchers.Default) {
            applySubjectMask(
              edgeResult,
              subjectMask,
              width,
              height
            )
          }
        }

      mapOf(
        "width" to edgeResult.width,
        "height" to edgeResult.height,
        "pixels" to pixels,
        "processingMs" to
          (System.nanoTime() - startedAt) / 1_000_000.0,
        "subjectFound" to subjectFound
      )
    }
  }

  private companion object {
    const val CENTER_HIT_CONFIDENCE = 0.32f
    const val MINIMUM_CENTER_CONFIDENCE = 0.12f
    const val SUBJECT_MASK_CONFIDENCE = 0.38f
    const val DOWNSAMPLED_MASK_THRESHOLD = 96
    const val MAXIMUM_CENTER_DISTANCE_FRACTION = 0.28
  }
}
