package expo.modules.keepfliplocalvision

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.opencv.android.OpenCVLoader

private class KeepFlipCannyException(message: String, cause: Throwable? = null) :
  CodedException("ERR_KEEPFLIP_CANNY", message, cause)

class KeepFlipCannyModule : Module() {
  private val isOpenCvReady by lazy {
    OpenCVLoader.initLocal()
  }

  override fun definition() = ModuleDefinition {
    Name("KeepFlipCanny")

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
        "processingMs" to result.processingMs
      )
    }
  }
}
