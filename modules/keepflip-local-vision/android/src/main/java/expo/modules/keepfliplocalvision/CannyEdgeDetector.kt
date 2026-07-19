package expo.modules.keepfliplocalvision

import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import kotlin.math.max
import kotlin.math.roundToInt

data class CannyEdgeResult(
  val width: Int,
  val height: Int,
  val pixels: ByteArray,
  val processingMs: Double
)

object CannyEdgeDetector {
  private const val MAX_EDGE = 384

  fun detect(
    yPlane: ByteArray,
    width: Int,
    height: Int,
    yRowStride: Int,
    lowThreshold: Double = 55.0,
    highThreshold: Double = 135.0
  ): CannyEdgeResult {
    require(width > 0 && height > 0)
    require(yRowStride >= width)
    require(yPlane.size >= yRowStride * height)

    val startedAt = System.nanoTime()

    // Remove Android row padding safely.
    val packedY = ByteArray(width * height)
    for (row in 0 until height) {
      System.arraycopy(
        yPlane,
        row * yRowStride,
        packedY,
        row * width,
        width
      )
    }

    val source = Mat(height, width, CvType.CV_8UC1)
    val resized = Mat()
    val blurred = Mat()
    val edges = Mat()

    try {
      source.put(0, 0, packedY)

      val scale =
        if (max(width, height) <= MAX_EDGE) 1.0
        else MAX_EDGE.toDouble() / max(width, height).toDouble()

      val outputWidth = max(1, (width * scale).roundToInt())
      val outputHeight = max(1, (height * scale).roundToInt())

      Imgproc.resize(
        source,
        resized,
        Size(outputWidth.toDouble(), outputHeight.toDouble()),
        0.0,
        0.0,
        Imgproc.INTER_AREA
      )

      Imgproc.GaussianBlur(
        resized,
        blurred,
        Size(5.0, 5.0),
        1.2
      )

      Imgproc.Canny(
        blurred,
        edges,
        lowThreshold,
        highThreshold,
        3,
        true
      )

      val pixels = ByteArray(outputWidth * outputHeight)
      edges.get(0, 0, pixels)

      return CannyEdgeResult(
        width = outputWidth,
        height = outputHeight,
        pixels = pixels,
        processingMs =
          (System.nanoTime() - startedAt) / 1_000_000.0
      )
    } finally {
      source.release()
      resized.release()
      blurred.release()
      edges.release()
    }
  }
}