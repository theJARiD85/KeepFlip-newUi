package com.keepflip.armeasure

import android.Manifest
import android.media.Image
import android.content.Context
import android.content.pm.PackageManager
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import android.view.MotionEvent
import android.view.Surface
import android.widget.FrameLayout
import org.opencv.android.OpenCVLoader
import com.google.ar.core.Anchor
import org.opencv.core.Core
import org.opencv.core.Mat
import org.opencv.core.MatOfDouble
import org.opencv.core.MatOfInt4
import org.opencv.core.Point as CvPoint
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.round
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.DepthPoint
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.Point
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.NotYetAvailableException
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.UnavailableApkTooOldException
import com.google.ar.core.exceptions.UnavailableArcoreNotInstalledException
import com.google.ar.core.exceptions.UnavailableDeviceNotCompatibleException
import com.google.ar.core.exceptions.UnavailableSdkTooOldException
import com.google.ar.core.exceptions.UnavailableUserDeclinedInstallationException
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.IdentityHashMap
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.sqrt

class KeepFlipARMeasureView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext), GLSurfaceView.Renderer {

  private val expoAppContext = appContext

private val onTrackingState by EventDispatcher()
private val onPointPlaced by EventDispatcher()
private val onTargetState by EventDispatcher()
private val onDetectedCorner by EventDispatcher()
private val onMeasurement by EventDispatcher()
private val onError by EventDispatcher()
private val onMeasurementGeometry by EventDispatcher()
private val onBoxMeasurement by EventDispatcher()
private val onItemMeasurement by EventDispatcher()

  private val glSurfaceView =
    GLSurfaceView(context)

  private data class Vec3(
  val x: Float,
  val y: Float,
  val z: Float
)

private data class SupportSurface(
  val origin: FloatArray,
  val normal: FloatArray
)

private data class CuboidModel(
  val corners: Array<FloatArray>,
  val lineVertices: FloatArray,

  val lengthMeters: Float,
  val widthMeters: Float,
  val heightMeters: Float,

  val lengthEdgeStart: FloatArray,
  val lengthEdgeEnd: FloatArray,

  val widthEdgeStart: FloatArray,
  val widthEdgeEnd: FloatArray,

  val heightEdgeStart: FloatArray,
  val heightEdgeEnd: FloatArray
)

  private data class DetectedCorner(
  val imageX: Float,
  val imageY: Float,
  val viewX: Float,
  val viewY: Float,
  val score: Float
)

private class ItemScanState {
  val points =
    mutableListOf<FloatArray>()

  val voxelKeys =
    mutableSetOf<String>()

  var seedPoint: FloatArray? = null
  var scanStartNs = 0L
  var lastSampleNs = 0L
  var sampleFrames = 0
  var cameraMotionMeters = 0f
  var lastCameraPose: Pose? = null
  var lastEstimate: ItemExtentEstimate? = null
  var stableEstimateCount = 0
  var depthWarningEmitted = false
  var tapX = 0f
  var tapY = 0f
  var tapPending = false
}

private var measurementMode =
  "item"

private var itemExtentModel:
  ItemExtentEstimate? = null

private val itemScan =
  ItemScanState()

private val itemSampleIntervalFrames = 3
private val itemSampleGridSize = 5
private val itemSampleRadiusDp = 150f
private val itemVoxelSizeMeters = 0.008f
private val itemSeedMaxDistanceMeters = 0.60f
private val itemDepthWindowMeters = 0.45f
private val itemMinimumSampleFrames = 8
private val itemMinimumPointCount = 32
private val itemMinimumMotionMeters = 0.025f
private val itemMinimumScanDurationNs = 1_250_000_000L
private val itemMaximumScanDurationNs = 2_500_000_000L

private var cuboidModel:
  CuboidModel? = null
private var cuboidOriginPose:
  Pose? = null


private var cuboidRevealStartNs =
  0L

private val cuboidRevealDurationNs =
  650_000_000L

private val cameraProjectionMatrix =
  FloatArray(16)

private val cameraViewMatrix =
  FloatArray(16)

private var lineProgram =
  0

private var linePositionAttribute =
  0

private var lineMvpUniform =
  0

private var linePointSizeUniform =
  0

private var linePointModeUniform =
  0

private val anchorMarkerVertexBuffer =
  createFloatBuffer(
    floatArrayOf(
      0f,
      0f,
      0f
    )
  )

private var lastGeometryEventNs =
  0L

  @Volatile
  private var session: Session? = null

  @Volatile
  private var sessionResumed = false

  private var installRequested = false
  private var disposed = false

  private var surfaceWidth = 0
  private var surfaceHeight = 0

  private var cameraTextureId = 0
  private var textureBoundSession: Session? = null

  private var shaderProgram = 0
  private var positionAttribute = 0
  private var texCoordAttribute = 0
  private var cameraTextureUniform = 0

  private var lastTrackingState: String? = null
  private var lastTrackingReason: String? = null

  private val measurementLock = Any()

  private val measurementAnchors =
    mutableListOf<Anchor>()

  /*
   * Keep the poses captured at the moment each corner is locked.
   * Anchor poses can be refined later; the measured geometry must not
   * be rebuilt from those moving poses.
   */
  private val measurementCornerPoses =
    mutableListOf<Pose>()

  /*
   * ARCore can temporarily pause an anchor while it refines or
   * relocalizes the world. Keep the last usable pose so a registered
   * corner does not silently disappear during that short pause.
   */
  private val measurementAnchorLastKnownPoses =
    IdentityHashMap<Anchor, Pose>()

  @Volatile
  private var cameraTrackingState =
    TrackingState.PAUSED

  private val targetSamples =
  mutableListOf<Pose>()

private var stableStartTimestampNs:
  Long? = null

private var waitingForMoveAfterLock =
  false

private var lastLockedPose:
  Pose? = null

private var measurementComplete =
  false

private var lastTargetState:
  String? = null

private var lastTargetProgressBucket =
  -1

private var openCvReady = false

private var frameCounter = 0

/*
 * CV is intentionally throttled.
 *
 * AR rendering stays full-rate, while visual corner
 * detection runs roughly every fifth frame.
 */
private val cornerDetectionIntervalFrames = 5

@Volatile
private var latestDetectedCorner:
  DetectedCorner? = null

private var latestCornerTimestampNs =
  0L

/*
 * Forget visual detections fairly quickly.
 * We never want to lock an old corner after the phone moves.
 */
private val maximumCornerAgeNs =
  900_000_000L

/*
 * The detected visual corner must be reasonably near
 * the center reticle.
 */
private val cornerSearchRadiusDp =
  120.0f

/*
 * How long the reticle must remain geometrically stable
 * before KeepFlip automatically captures the point.
 */

private val stableDurationNs =
  350_000_000L

private val stabilityRadiusMeters =
  0.025f

private val rearmDistanceMeters =
  0.075f

private val minimumStableSamples =
  8

private val maximumStableSamples =
  24

private var lostCornerFrames = 0

private val maximumLostCornerFrames =
  8

  private val quadCoords: FloatBuffer =
    createFloatBuffer(
      floatArrayOf(
        -1.0f, -1.0f,
         1.0f, -1.0f,
        -1.0f,  1.0f,
         1.0f,  1.0f
      )
    )

  private val quadTexCoords: FloatBuffer =
    createFloatBuffer(
      floatArrayOf(
        0.0f, 0.0f,
        1.0f, 0.0f,
        0.0f, 1.0f,
        1.0f, 1.0f
      )
    )

  private val quadCoordsArray =
    floatArrayOf(
      -1.0f, -1.0f,
       1.0f, -1.0f,
      -1.0f,  1.0f,
       1.0f,  1.0f
    )

  private val transformedTexCoords =
    FloatArray(8)

  init {
    glSurfaceView.setEGLContextClientVersion(2)

    glSurfaceView.preserveEGLContextOnPause = true

    glSurfaceView.setRenderer(this)
    glSurfaceView.setOnTouchListener { _, event ->
      if (event.actionMasked == MotionEvent.ACTION_UP) {
        val tapX = event.x
        val tapY = event.y
        glSurfaceView.queueEvent {
          if (
            !disposed &&
            measurementMode == "item" &&
            !measurementComplete &&
            itemScan.seedPoint == null
          ) {
            itemScan.tapX = tapX
            itemScan.tapY = tapY
            itemScan.tapPending = true
            itemScan.depthWarningEmitted = false
            emitTargetState("searching_item", 0f)
          }
        }
      }
      true
    }

    glSurfaceView.renderMode =
      GLSurfaceView.RENDERMODE_CONTINUOUSLY

    addView(
      glSurfaceView,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
    )

  openCvReady =
    try {
      OpenCVLoader.initLocal()
    } catch (
      error: Throwable
    ) {
      false
    }

    if (!openCvReady) {
      emitError(
        "OPENCV_INITIALIZATION_FAILED",
        "KeepFlip could not initialize its visual corner detector."
      )
    }
  }

override fun onAttachedToWindow() {
  super.onAttachedToWindow()

  disposed = false

  /*
   * Give the previous camera client (VisionCamera) time to fully
   * release Camera2 before ARCore attempts to create its session.
   */
  postDelayed(
    {
      if (!disposed && isAttachedToWindow) {
        startOrResumeSession()
      }
    },
    1000L
  )
}
  override fun onDetachedFromWindow() {
    pauseSession()

    super.onDetachedFromWindow()
  }

  override fun onWindowFocusChanged(
    hasWindowFocus: Boolean
  ) {
    super.onWindowFocusChanged(
      hasWindowFocus
    )

if (
  hasWindowFocus &&
  !disposed &&
  !sessionResumed &&
  session != null
) {
  post {
    startOrResumeSession()
  }
}
  }

  private fun emitBoxMeasurement(
  model: CuboidModel
) {
  post {
    onBoxMeasurement(
      mapOf<String, Any>(
        "lengthCm" to
          model.lengthMeters *
          100f,

        "widthCm" to
          model.widthMeters *
          100f,

        "heightCm" to
          model.heightMeters *
          100f,

        "lengthInches" to
          model.lengthMeters *
          39.3700787f,

        "widthInches" to
          model.widthMeters *
          39.3700787f,

        "heightInches" to
          model.heightMeters *
          39.3700787f
      )
    )
  }
}

private fun emitItemMeasurementLabels() {
  val model = itemExtentModel ?: return
  val now = System.nanoTime()
  if (now - lastGeometryEventNs < 80_000_000L) {
    return
  }
  val lengthLabel = buildProjectedWorldMeasurementLabel(
    model.lengthEdgeStart,
    model.lengthEdgeEnd,
    "length",
    model.lengthMeters * 39.3700787f
  ) ?: return
  val widthLabel = buildProjectedWorldMeasurementLabel(
    model.widthEdgeStart,
    model.widthEdgeEnd,
    "width",
    model.widthMeters * 39.3700787f
  ) ?: return
  val heightLabel = buildProjectedWorldMeasurementLabel(
    model.heightEdgeStart,
    model.heightEdgeEnd,
    "height",
    model.heightMeters * 39.3700787f
  ) ?: return
  lastGeometryEventNs = now
  post {
    onMeasurementGeometry(
      mapOf<String, Any>(
        "kind" to "item_extents",
        "labels" to listOf(lengthLabel, widthLabel, heightLabel)
      )
    )
  }
}

private fun buildProjectedWorldMeasurementLabel(
  worldStart: FloatArray,
  worldEnd: FloatArray,
  id: String,
  inches: Float
): Map<String, Any>? {
  val start = projectWorldPointToView(worldStart) ?: return null
  val end = projectWorldPointToView(worldEnd) ?: return null
  val dx = end[0] - start[0]
  val dy = end[1] - start[1]
  val screenLength = kotlin.math.max(1f, hypot(dx, dy))
  val nx = -dy / screenLength
  val ny = dx / screenLength
  val offset = 20f * resources.displayMetrics.density
  val midpointX = (start[0] + end[0]) / 2f
  val midpointY = (start[1] + end[1]) / 2f
  return mapOf(
    "id" to id,
    "x" to midpointX + nx * offset,
    "y" to midpointY + ny * offset,
    "inches" to inches
  )
}
private fun emitMeasurementLabels() {
  val model =
    cuboidModel
      ?: return

  val anchorPose =
    cuboidOriginPose
      ?: return

  val now =
    System.nanoTime()

  /*
   * ~12 UI updates/second is plenty for text labels.
   */
  if (
    now -
      lastGeometryEventNs <
    80_000_000L
  ) {
    return
  }

  lastGeometryEventNs =
    now

  val lengthLabel =
    buildProjectedMeasurementLabel(
      anchorPose,
      model.lengthEdgeStart,
      model.lengthEdgeEnd,
      "length",
      model.lengthMeters *
        39.3700787f
    )
      ?: return

  val widthLabel =
    buildProjectedMeasurementLabel(
      anchorPose,
      model.widthEdgeStart,
      model.widthEdgeEnd,
      "width",
      model.widthMeters *
        39.3700787f
    )
      ?: return

  val heightLabel =
    buildProjectedMeasurementLabel(
      anchorPose,
      model.heightEdgeStart,
      model.heightEdgeEnd,
      "height",
      model.heightMeters *
        39.3700787f
    )
      ?: return

  post {
    onMeasurementGeometry(
      mapOf<String, Any>(
        "labels" to
          listOf(
            lengthLabel,
            widthLabel,
            heightLabel
          )
      )
    )
  }
}

/*
 * Use the live ARCore pose while both the camera and anchor are tracking.
 * During a temporary PAUSED or STOPPED state, hold the last pose instead of
 * dropping the marker. This keeps registered corners visible while ARCore
 * relocalizes or retires a short-lived depth point.
 */
private fun poseForAnchorRendering(
  anchor: Anchor
): Pose? {
  return synchronized(
    measurementLock
  ) {
    when {
      anchor.trackingState ==
        TrackingState.STOPPED -> {
        measurementAnchorLastKnownPoses[anchor]
      }

      anchor.trackingState ==
        TrackingState.TRACKING &&
        cameraTrackingState ==
        TrackingState.TRACKING -> {
        val pose =
          anchor.pose

        measurementAnchorLastKnownPoses[anchor] =
          pose

        pose
      }

      else -> {
        measurementAnchorLastKnownPoses[anchor]
      }
    }
  }
}

private fun buildProjectedMeasurementLabel(
  anchorPose: Pose,
  localStart: FloatArray,
  localEnd: FloatArray,
  id: String,
  inches: Float
): Map<String, Any>? {
  val start =
    projectLocalPoint(
      anchorPose,
      localStart
    )
      ?: return null

  val end =
    projectLocalPoint(
      anchorPose,
      localEnd
    )
      ?: return null

  val dx =
    end[0] -
      start[0]

  val dy =
    end[1] -
      start[1]

  val screenLength =
    kotlin.math.max(
      1f,
      kotlin.math.hypot(
        dx,
        dy
      )
    )

  /*
   * Screen-space normal puts the label beside,
   * not directly on top of, its corresponding 3D edge.
   */
  val nx =
    -dy /
      screenLength

  val ny =
    dx /
      screenLength

  val offset =
    20f *
      resources.displayMetrics.density

  val midpointX =
    (
      start[0] +
        end[0]
      ) / 2f

  val midpointY =
    (
      start[1] +
        end[1]
      ) / 2f

  return mapOf(
    "id" to id,

    "x" to
      midpointX +
      nx *
      offset,

    "y" to
      midpointY +
      ny *
      offset,

    "inches" to
      inches
  )
}

private fun projectWorldPointToView(
  world: FloatArray
): FloatArray? {
  val world4 =
    floatArrayOf(
      world[0],
      world[1],
      world[2],
      1f
    )

  val cameraSpace =
    FloatArray(
      4
    )

  val clipSpace =
    FloatArray(
      4
    )

  Matrix.multiplyMV(
    cameraSpace,
    0,
    cameraViewMatrix,
    0,
    world4,
    0
  )

  if (
    cameraSpace[2] >= 0f
  ) {
    return null
  }

  Matrix.multiplyMV(
    clipSpace,
    0,
    cameraProjectionMatrix,
    0,
    cameraSpace,
    0
  )

  val w =
    clipSpace[3]

  if (
    kotlin.math.abs(
      w
    ) <
    0.0001f
  ) {
    return null
  }

  val ndcX =
    clipSpace[0] /
      w

  val ndcY =
    clipSpace[1] /
      w

  return floatArrayOf(
    (
      ndcX +
        1f
      ) *
      0.5f *
      surfaceWidth,

    (
      1f -
        ndcY
      ) *
      0.5f *
      surfaceHeight
  )
}

private fun projectLocalPoint(
  anchorPose: Pose,
  localPoint: FloatArray
): FloatArray? {
  val world =
    anchorPose.transformPoint(
      localPoint
    )

  return projectWorldPointToView(
    world
  )
}
  private fun startOrResumeSession() {
    if (disposed) {
      return
    }

    val activity =
      expoAppContext.currentActivity

    if (activity == null) {
      emitError(
        "NO_ACTIVITY",
        "KeepFlip could not access the current Android activity."
      )
      return
    }

    if (
      context.checkSelfPermission(
        Manifest.permission.CAMERA
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      emitError(
        "CAMERA_PERMISSION_REQUIRED",
        "Camera permission is required for AR measurement."
      )
      return
    }

    var currentSession =
      session

    if (currentSession == null) {
      try {
        val availability =
          ArCoreApk
            .getInstance()
            .checkAvailability(
              activity
            )

        if (!availability.isSupported) {
          emitTrackingState(
            "unavailable",
            "ARCore is not supported on this device."
          )
          return
        }

        if (
          availability !=
          ArCoreApk.Availability.SUPPORTED_INSTALLED
        ) {
          when (
            ArCoreApk
              .getInstance()
              .requestInstall(
                activity,
                !installRequested
              )
          ) {
            ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
              installRequested = true

              emitTrackingState(
                "install_required"
              )

              return
            }

            ArCoreApk.InstallStatus.INSTALLED -> {
              // Continue below.
            }
          }
        }

        currentSession =
          Session(activity)

        val config =
          Config(currentSession)

        config.planeFindingMode =
          Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL

        config.focusMode =
          Config.FocusMode.AUTO

        if (
          currentSession.isDepthModeSupported(
            Config.DepthMode.AUTOMATIC
          )
        ) {
          config.depthMode =
            Config.DepthMode.AUTOMATIC
        }

        currentSession.configure(
          config
        )

        session =
          currentSession

        textureBoundSession =
          null

        emitTrackingState(
          "initializing"
        )
      } catch (
        error:
          UnavailableArcoreNotInstalledException
      ) {
        emitError(
          "ARCORE_NOT_INSTALLED",
          "Google Play Services for AR is not installed."
        )
        return
      } catch (
        error:
          UnavailableUserDeclinedInstallationException
      ) {
        emitError(
          "ARCORE_INSTALL_DECLINED",
          "ARCore installation was declined."
        )
        return
      } catch (
        error:
          UnavailableApkTooOldException
      ) {
        emitError(
          "ARCORE_UPDATE_REQUIRED",
          "Google Play Services for AR must be updated."
        )
        return
      } catch (
        error:
          UnavailableSdkTooOldException
      ) {
        emitError(
          "ARCORE_SDK_TOO_OLD",
          "The KeepFlip AR module must be updated."
        )
        return
      } catch (
        error:
          UnavailableDeviceNotCompatibleException
      ) {
        emitError(
          "ARCORE_UNSUPPORTED",
          "This device does not support ARCore."
        )
        return
      } catch (
        error: Exception
      ) {
        emitError(
          "ARCORE_SESSION_FAILED",
          error.message
            ?: "KeepFlip could not create an ARCore session."
        )
        return
      }
    }

    if (sessionResumed) {
      return
    }

    try {
      currentSession.resume()

      glSurfaceView.onResume()

      sessionResumed = true
    } catch (
      error:
        CameraNotAvailableException
    ) {
      emitError(
        "CAMERA_NOT_AVAILABLE",
        "The camera is currently unavailable."
      )

      currentSession.close()

      session = null
      sessionResumed = false
      textureBoundSession = null
    } catch (
      error: Exception
    ) {
      emitError(
        "ARCORE_RESUME_FAILED",
        error.message
          ?: "KeepFlip could not resume the AR session."
      )
    }
  }

  private fun pauseSession() {
    val currentSession =
      session ?: return

    if (!sessionResumed) {
      return
    }

    try {
      /*
       * Order matters:
       * stop the GL thread first so it cannot call
       * Session.update() after the ARCore session
       * has already been paused.
       */
      glSurfaceView.onPause()

      currentSession.pause()
    } catch (
      ignored: Exception
    ) {
      // Session teardown should not crash the React view.
    } finally {
      sessionResumed = false
    }
  }

fun setMeasurementMode(mode: String?) {
  val normalized =
    if (
      mode?.equals("box", ignoreCase = true) == true
    ) {
      "box"
    } else {
      "item"
    }

  if (measurementMode == normalized) {
    return
  }

  measurementMode = normalized
  resetMeasurement()
}

fun resetMeasurement() {
  synchronized(
    measurementLock
  ) {
    measurementAnchors.forEach {
      it.detach()
    }

    measurementAnchors.clear()

    measurementCornerPoses.clear()

    measurementAnchorLastKnownPoses.clear()
  }

  cuboidModel =
    null

  cuboidOriginPose =
    null

  cuboidRevealStartNs =
    0L

  clearTargetCandidate()

  clearItemScan()

  itemExtentModel =
    null

  waitingForMoveAfterLock =
    false

  lastLockedPose =
    null

  measurementComplete =
    false

  lastTargetState =
    null

  lastTargetProgressBucket =
    -1

  lostCornerFrames =
    0

  latestDetectedCorner =
    null

  latestCornerTimestampNs =
    0L

  emitTargetState(
    if (measurementMode == "box") "searching_corner" else "searching_item",
    0f
  )
}

fun dispose() {
  disposed = true

  pauseSession()

  synchronized(
    measurementLock
  ) {
    measurementAnchors.forEach {
      it.detach()
    }

    measurementAnchors.clear()

    measurementCornerPoses.clear()

    measurementAnchorLastKnownPoses.clear()
  }

  cuboidModel =
    null

  clearItemScan()

  cuboidOriginPose =
    null

  itemExtentModel =
    null

  cuboidRevealStartNs =
    0L

  clearTargetCandidate()

  latestDetectedCorner =
    null

  latestCornerTimestampNs =
    0L

  measurementComplete =
    false

  waitingForMoveAfterLock =
    false

  lastLockedPose =
    null

  session?.close()

  session = null
  textureBoundSession = null
  sessionResumed = false
}

  override fun onSurfaceCreated(
    gl: GL10?,
    config: EGLConfig?
  ) {
    GLES20.glClearColor(
      0f,
      0f,
      0f,
      1f
    )

    try {
      cameraTextureId =
        createExternalCameraTexture()

      shaderProgram =
        createCameraProgram()

      lineProgram =
  createLineProgram()

linePositionAttribute =
  GLES20.glGetAttribLocation(
    lineProgram,
    "a_Position"
  )

lineMvpUniform =
  GLES20.glGetUniformLocation(
    lineProgram,
    "u_MVP"
  )

linePointSizeUniform =
  GLES20.glGetUniformLocation(
    lineProgram,
    "u_PointSize"
  )

linePointModeUniform =
  GLES20.glGetUniformLocation(
    lineProgram,
    "u_PointMode"
  )

      positionAttribute =
        GLES20.glGetAttribLocation(
          shaderProgram,
          "a_Position"
        )

      texCoordAttribute =
        GLES20.glGetAttribLocation(
          shaderProgram,
          "a_TexCoord"
        )

      cameraTextureUniform =
        GLES20.glGetUniformLocation(
          shaderProgram,
          "u_CameraTexture"
        )

      textureBoundSession =
        null
    } catch (
      error: Exception
    ) {
      emitError(
        "GL_INITIALIZATION_FAILED",
        error.message
          ?: "KeepFlip could not initialize the AR camera renderer."
      )
    }
  }

  private fun createLineProgram():
  Int {
  val vertexShader =
    compileShader(
      GLES20.GL_VERTEX_SHADER,
      """
      uniform mat4 u_MVP;
      attribute vec3 a_Position;
      uniform float u_PointSize;

      void main() {
        gl_Position =
          u_MVP *
          vec4(
            a_Position,
            1.0
          );
        gl_PointSize =
          u_PointSize;
      }
      """.trimIndent()
    )

  val fragmentShader =
    compileShader(
      GLES20.GL_FRAGMENT_SHADER,
      """
      precision mediump float;
      uniform float u_PointMode;

      void main() {
        if (
          u_PointMode >
          0.5
        ) {
          vec2 offset =
            gl_PointCoord -
            vec2(
              0.5
            );

          if (
            dot(
              offset,
              offset
            ) >
            0.25
          ) {
            discard;
          }
        }

        gl_FragColor =
          vec4(
            1.0,
            0.84,
            0.35,
            1.0
          );
      }
      """.trimIndent()
    )

  val program =
    GLES20.glCreateProgram()

  GLES20.glAttachShader(
    program,
    vertexShader
  )

  GLES20.glAttachShader(
    program,
    fragmentShader
  )

  GLES20.glLinkProgram(
    program
  )

  val status =
    IntArray(
      1
    )

  GLES20.glGetProgramiv(
    program,
    GLES20.GL_LINK_STATUS,
    status,
    0
  )

  if (
    status[0] !=
    GLES20.GL_TRUE
  ) {
    throw RuntimeException(
      "Cuboid shader link failed: ${
        GLES20.glGetProgramInfoLog(
          program
        )
      }"
    )
  }

  GLES20.glDeleteShader(
    vertexShader
  )

  GLES20.glDeleteShader(
    fragmentShader
  )

  return program
}

  override fun onSurfaceChanged(
    gl: GL10?,
    width: Int,
    height: Int
  ) {
    surfaceWidth =
      width

    surfaceHeight =
      height

    GLES20.glViewport(
      0,
      0,
      width,
      height
    )
  }

  override fun onDrawFrame(
    gl: GL10?
  ) {
    GLES20.glClear(
      GLES20.GL_COLOR_BUFFER_BIT or
        GLES20.GL_DEPTH_BUFFER_BIT
    )

    val currentSession =
      session ?: return

    if (
      !sessionResumed ||
      cameraTextureId == 0 ||
      surfaceWidth <= 0 ||
      surfaceHeight <= 0
    ) {
      return
    }

    try {
      if (
        textureBoundSession !==
        currentSession
      ) {
        currentSession.setCameraTextureNames(
          intArrayOf(
            cameraTextureId
          )
        )

        textureBoundSession =
          currentSession
      }

      updateDisplayGeometry(
        currentSession
      )

    val frame =
      currentSession.update()

      frame.camera.getProjectionMatrix(
  cameraProjectionMatrix,
  0,
  0.05f,
  100f
)

frame.camera.getViewMatrix(
  cameraViewMatrix,
  0
)

    updateTrackingState(
      frame
    )

    updateCameraTextureCoordinates(
      frame
    )

    if (frame.timestamp != 0L) {
      drawCameraBackground()

      frameCounter++

      if (
        measurementMode == "box" &&
        openCvReady &&
        frameCounter %
          cornerDetectionIntervalFrames == 0
      ) {
        detectVisualCorner(
          frame
        )
      }
    }

    if (measurementMode == "box") {
      handleAutoTarget(
        frame
      )

      drawMeasuredCuboid()
      drawMeasurementAnchorMarkers()
      emitMeasurementLabels()
    } else {
      handleAutoItemMeasurement(
        frame
      )

      drawMeasuredItemWireframe()
      emitItemMeasurementLabels()
    }
    } catch (
      error:
        CameraNotAvailableException
    ) {
      emitError(
        "CAMERA_NOT_AVAILABLE",
        "The camera became unavailable during AR measurement."
      )
    } catch (
      error: Exception
    ) {
      emitError(
        "AR_FRAME_FAILED",
        error.message
          ?: "KeepFlip could not process the AR frame."
      )
    }
  }

private fun drawMeasuredItemWireframe() {
  val model = itemExtentModel ?: return
  if (
    lineProgram == 0 ||
    linePositionAttribute < 0 ||
    lineMvpUniform < 0 ||
    linePointModeUniform < 0
  ) {
    return
  }
  val mvp = FloatArray(16)
  Matrix.multiplyMM(
    mvp,
    0,
    cameraProjectionMatrix,
    0,
    cameraViewMatrix,
    0
  )
  val vertexBuffer = createFloatBuffer(model.lineVertices)
  GLES20.glUseProgram(lineProgram)
  GLES20.glUniform1f(linePointModeUniform, 0f)
  if (linePointSizeUniform >= 0) {
    GLES20.glUniform1f(linePointSizeUniform, 1f)
  }
  GLES20.glUniformMatrix4fv(lineMvpUniform, 1, false, mvp, 0)
  vertexBuffer.position(0)
  GLES20.glVertexAttribPointer(
    linePositionAttribute,
    3,
    GLES20.GL_FLOAT,
    false,
    0,
    vertexBuffer
  )
  GLES20.glEnableVertexAttribArray(linePositionAttribute)
  GLES20.glLineWidth(4f)
  GLES20.glDrawArrays(
    GLES20.GL_LINES,
    0,
    model.lineVertices.size / 3
  )
  GLES20.glDisableVertexAttribArray(linePositionAttribute)
}
  private fun drawMeasuredCuboid() {
  val model =
    cuboidModel
      ?: return

  val anchorPose =
    cuboidOriginPose
      ?: return

  val elapsed =
    (
      System.nanoTime() -
        cuboidRevealStartNs
      ).coerceAtLeast(
        0L
      )

  val rawProgress =
    (
      elapsed.toDouble() /
        cuboidRevealDurationNs.toDouble()
      )
      .coerceIn(
        0.0,
        1.0
      )
      .toFloat()

  /*
   * Smooth ease-out.
   */
  val progress =
    1f -
      (
        1f -
          rawProgress
        ) *
      (
        1f -
          rawProgress
        )

  val center =
    calculateCuboidCenter(
      model.corners
    )

  /*
   * THIS is the animation scaling formula.
   *
   * Final dimensions remain physically correct.
   * During reveal every axis grows by the same scalar,
   * preserving L:W:H at all times.
   */
  val animatedVertices =
    model.lineVertices.copyOf()

  var index =
    0

  while (
    index <
    animatedVertices.size
  ) {
    animatedVertices[index] =
      center[0] +
        (
          animatedVertices[index] -
            center[0]
          ) *
        progress

    animatedVertices[index + 1] =
      center[1] +
        (
          animatedVertices[index + 1] -
            center[1]
          ) *
        progress

    animatedVertices[index + 2] =
      center[2] +
        (
          animatedVertices[index + 2] -
            center[2]
          ) *
        progress

    index +=
      3
  }

  val vertexBuffer =
    createFloatBuffer(
      animatedVertices
    )

  val modelMatrix =
    FloatArray(
      16
    )

  val viewModel =
    FloatArray(
      16
    )

  val mvp =
    FloatArray(
      16
    )

  anchorPose.toMatrix(
    modelMatrix,
    0
  )

  Matrix.multiplyMM(
    viewModel,
    0,
    cameraViewMatrix,
    0,
    modelMatrix,
    0
  )

  Matrix.multiplyMM(
    mvp,
    0,
    cameraProjectionMatrix,
    0,
    viewModel,
    0
  )

  GLES20.glUseProgram(
    lineProgram
  )

  GLES20.glUniform1f(
    linePointModeUniform,
    0f
  )

  GLES20.glUniform1f(
    linePointSizeUniform,
    1f
  )

  GLES20.glUniformMatrix4fv(
    lineMvpUniform,
    1,
    false,
    mvp,
    0
  )

  vertexBuffer.position(
    0
  )

  GLES20.glVertexAttribPointer(
    linePositionAttribute,
    3,
    GLES20.GL_FLOAT,
    false,
    0,
    vertexBuffer
  )

  GLES20.glEnableVertexAttribArray(
    linePositionAttribute
  )

  GLES20.glLineWidth(
    4f
  )

  GLES20.glDrawArrays(
    GLES20.GL_LINES,
    0,
    animatedVertices.size /
      3
  )

  GLES20.glDisableVertexAttribArray(
    linePositionAttribute
  )
}

private fun drawMeasurementAnchorMarkers() {
  if (
    lineProgram == 0 ||
    linePositionAttribute < 0 ||
    lineMvpUniform < 0 ||
    linePointSizeUniform < 0 ||
    linePointModeUniform < 0
  ) {
    return
  }

  val markerPoses =
    synchronized(
      measurementLock
    ) {
      measurementCornerPoses.toList()
    }

  if (
    markerPoses.isEmpty()
  ) {
    return
  }

  GLES20.glUseProgram(
    lineProgram
  )

  GLES20.glUniform1f(
    linePointModeUniform,
    1f
  )

  GLES20.glUniform1f(
    linePointSizeUniform,
    18f
  )

  anchorMarkerVertexBuffer.position(
    0
  )

  GLES20.glVertexAttribPointer(
    linePositionAttribute,
    3,
    GLES20.GL_FLOAT,
    false,
    0,
    anchorMarkerVertexBuffer
  )

  GLES20.glEnableVertexAttribArray(
    linePositionAttribute
  )

  markerPoses.forEach { anchorPose ->

    val modelMatrix =
      FloatArray(
        16
      )

    val viewModel =
      FloatArray(
        16
      )

    val mvp =
      FloatArray(
        16
      )

    anchorPose.toMatrix(
      modelMatrix,
      0
    )

    Matrix.multiplyMM(
      viewModel,
      0,
      cameraViewMatrix,
      0,
      modelMatrix,
      0
    )

    Matrix.multiplyMM(
      mvp,
      0,
      cameraProjectionMatrix,
      0,
      viewModel,
      0
    )

    GLES20.glUniformMatrix4fv(
      lineMvpUniform,
      1,
      false,
      mvp,
      0
    )

    GLES20.glDrawArrays(
      GLES20.GL_POINTS,
      0,
      1
    )
  }

  GLES20.glDisableVertexAttribArray(
    linePositionAttribute
  )

  GLES20.glUniform1f(
    linePointModeUniform,
    0f
  )
}

private fun calculateCuboidCenter(
  corners: Array<FloatArray>
): FloatArray {
  var x =
    0f

  var y =
    0f

  var z =
    0f

  for (corner in corners) {
    x +=
      corner[0]

    y +=
      corner[1]

    z +=
      corner[2]
  }

  val count =
    corners.size.toFloat()

  return floatArrayOf(
    x / count,
    y / count,
    z / count
  )
}

  private fun detectVisualCorner(
    frame: Frame
  ) {
    val image =
      try {
        frame.acquireCameraImage()
      } catch (
        ignored:
          NotYetAvailableException
      ) {
        return
      } catch (
        ignored: Exception
      ) {
        return
      }

    try {
      val gray =
        cameraImageToGrayMat(
          image
        )

      if (
        gray.empty()
      ) {
        gray.release()
        return
      }

      val fineBlur =
        Mat()

      val coarseBlur =
        Mat()

      val fineEdges =
        Mat()

      val coarseEdges =
        Mat()

      val edges =
        Mat()

      val lines =
        Mat()

      try {
        /*
         * Keep one fine pass for sharp package edges and one coarse
         * pass for motion-blurred or low-contrast edges. The two edge
         * maps are fused before line extraction.
         */
        Imgproc.GaussianBlur(
          gray,
          fineBlur,
          Size(
            3.0,
            3.0
          ),
          0.0
        )

        Imgproc.GaussianBlur(
          gray,
          coarseBlur,
          Size(
            7.0,
            7.0
          ),
          0.0
        )

        val fineThresholds =
          adaptiveCannyThresholds(
            fineBlur
          )

        val coarseThresholds =
          adaptiveCannyThresholds(
            coarseBlur
          )

        Imgproc.Canny(
          fineBlur,
          fineEdges,
          fineThresholds[0],
          fineThresholds[1],
          3,
          false
        )

        Imgproc.Canny(
          coarseBlur,
          coarseEdges,
          coarseThresholds[0],
          coarseThresholds[1],
          3,
          false
        )

        Core.bitwise_or(
          fineEdges,
          coarseEdges,
          edges
        )

        /*
        * Detect line segments instead of infinite lines.
        *
        * This gives us physical edge endpoints and lets
        * us reject tiny texture/noise edges.
        */
        val minimumDimension =
          min(
            image.width,
            image.height
          ).toDouble()

        val houghThreshold =
          (
            minimumDimension *
              0.045
            ).toInt()
              .coerceAtLeast(
                24
              )

        val minimumLineLength =
          (
            minimumDimension *
              0.035
            ).coerceIn(
              20.0,
              42.0
            )

        val maximumLineGap =
          (
            minimumDimension *
              0.018
            ).coerceIn(
              8.0,
              18.0
            )

        Imgproc.HoughLinesP(
          edges,
          lines,
          1.0,
          Math.PI / 180.0,
          houghThreshold,
          minimumLineLength,
          maximumLineGap
        )

        val corner =
          selectBestCorner(
            frame,
            lines,
            image.width,
            image.height
          )

        if (
          corner != null
        ) {
          latestDetectedCorner =
            corner

          latestCornerTimestampNs =
            frame.timestamp

          emitDetectedCorner(
            corner
          )
        } else {
          latestDetectedCorner =
            null
        }
      } finally {
        gray.release()
        fineBlur.release()
        coarseBlur.release()
        fineEdges.release()
        coarseEdges.release()
        edges.release()
        lines.release()
      }
    } finally {
      image.close()
    }
  }

  private fun cameraImageToGrayMat(
    image: Image
  ): Mat {
    val width =
      image.width

    val height =
      image.height

    val plane =
      image.planes[0]

    val buffer =
      plane.buffer

    val rowStride =
      plane.rowStride

    val pixelStride =
      plane.pixelStride

    val data =
      ByteArray(
        width * height
      )

    /*
    * ARCore's Y plane is grayscale already.
    *
    * We copy row-by-row because Camera2 is allowed to
    * pad each image row.
    */
    if (
      pixelStride == 1 &&
      rowStride == width
    ) {
      buffer.rewind()

      val count =
        min(
          buffer.remaining(),
          data.size
        )

      buffer.get(
        data,
        0,
        count
      )
    } else {
      val row =
        ByteArray(
          rowStride
        )

      var outputIndex =
        0

      for (
        y in 0 until height
      ) {
        buffer.position(
          y * rowStride
        )

        val bytesToRead =
          min(
            rowStride,
            buffer.remaining()
          )

        buffer.get(
          row,
          0,
          bytesToRead
        )

        for (
          x in 0 until width
        ) {
          val sourceIndex =
            x *
              pixelStride

          if (
            sourceIndex <
            bytesToRead
          ) {
            data[
              outputIndex
            ] =
              row[
                sourceIndex
              ]
          }

          outputIndex++
        }
      }
    }

    val mat =
      Mat(
        height,
        width,
        org.opencv.core.CvType.CV_8UC1
      )

    mat.put(
      0,
      0,
      data
    )

    return mat
  }

  private fun adaptiveCannyThresholds(
    image: Mat
  ): DoubleArray {
    val mean =
      MatOfDouble()

    val standardDeviation =
      MatOfDouble()

    try {
      Core.meanStdDev(
        image,
        mean,
        standardDeviation
      )

      val meanValue =
        mean
          .get(
            0,
            0
          )
          ?.getOrNull(
            0
          )
          ?: 128.0

      val standardDeviationValue =
        standardDeviation
          .get(
            0,
            0
          )
          ?.getOrNull(
            0
          )
          ?: 32.0

      val high =
        (
          meanValue +
            standardDeviationValue *
            0.75
          ).coerceIn(
            60.0,
            205.0
          )

      val low =
        (
          high *
            0.45
          ).coerceIn(
            22.0,
            (
              high -
                12.0
              ).coerceAtLeast(
                24.0
              )
          )

      return doubleArrayOf(
        low,
        high
      )
    } finally {
      mean.release()
      standardDeviation.release()
    }
  }

  private fun selectBestCorner(
  frame: Frame,
  linesMat: Mat,
  imageWidth: Int,
  imageHeight: Int
): DetectedCorner? {
  if (
    linesMat.empty()
  ) {
    return null
  }

  val segments =
    mutableListOf<FloatArray>()

  for (
    row in 0 until
      linesMat.rows()
  ) {
    val values =
      linesMat.get(
        row,
        0
      )
        ?: continue

    if (
      values.size <
      4
    ) {
      continue
    }

    val x1 =
      values[0].toFloat()

    val y1 =
      values[1].toFloat()

    val x2 =
      values[2].toFloat()

    val y2 =
      values[3].toFloat()

    val length =
      hypot(
        x2 - x1,
        y2 - y1
      )

    /*
     * Reject small texture/detail lines.
     */
    if (
      length <
      28f
    ) {
      continue
    }

    segments.add(
      floatArrayOf(
        x1,
        y1,
        x2,
        y2,
        length
      )
    )
  }

  /*
   * Don't let pathological scenes explode into an
   * O(N²) intersection test.
   */
  segments.sortByDescending {
    it[4]
  }

  val usableSegments =
    if (
      segments.size >
      36
    ) {
      segments.subList(
        0,
        36
      )
    } else {
      segments
    }

  var bestCorner:
    DetectedCorner? =
      null

  var bestScore =
    Float.NEGATIVE_INFINITY

  val centerX =
    surfaceWidth /
      2.0f

  val centerY =
    surfaceHeight /
      2.0f

  val searchRadiusPx =
    cornerSearchRadiusDp *
      resources.displayMetrics.density

  for (
    firstIndex in
      usableSegments.indices
  ) {
    for (
      secondIndex in
        firstIndex + 1 until
        usableSegments.size
    ) {
      val a =
        usableSegments[
          firstIndex
        ]

      val b =
        usableSegments[
          secondIndex
        ]

      val angleDifference =
        segmentAngleDifferenceDegrees(
          a,
          b
        )

      /*
       * Parallel-ish lines are not corners.
       *
       * Perspective means a box corner is not guaranteed
       * to project to a perfect 90-degree intersection,
       * so keep the window fairly broad.
       */
      if (
        angleDifference <
        35f
      ) {
        continue
      }

      val intersection =
        infiniteLineIntersection(
          a,
          b
        )
          ?: continue

      val imageX =
        intersection.first

      val imageY =
        intersection.second

      if (
        imageX <
        0f ||
        imageY <
        0f ||
        imageX >=
        imageWidth.toFloat() ||
        imageY >=
        imageHeight.toFloat()
      ) {
        continue
      }

      /*
       * The infinite lines may intersect far away from
       * the actual visible line segments.
       */
      val distanceToA =
        distanceToSegment(
          imageX,
          imageY,
          a
        )

      val distanceToB =
        distanceToSegment(
          imageX,
          imageY,
          b
        )

      if (
        distanceToA >
        22f ||
        distanceToB >
        22f
      ) {
        continue
      }

      val input =
        floatArrayOf(
          imageX,
          imageY
        )

      val view =
        FloatArray(
          2
        )

      frame.transformCoordinates2d(
        Coordinates2d.IMAGE_PIXELS,
        input,
        Coordinates2d.VIEW,
        view
      )

      val viewX =
        view[0]

      val viewY =
        view[1]

      val distanceToReticle =
        hypot(
          viewX - centerX,
          viewY - centerY
        )

      if (
        distanceToReticle >
        searchRadiusPx
      ) {
        continue
      }

      /*
       * Score favors:
       * - proximity to reticle
       * - long supported edges
       * - corner angles closer to ~90 degrees
       */
      val proximityScore =
        1f -
          (
            distanceToReticle /
              searchRadiusPx
            ).coerceIn(
              0f,
              1f
            )

      val lineLengthScore =
        (
          (
            a[4] +
              b[4]
            ) /
            320f
          ).coerceIn(
            0f,
            1f
          )

      val angleScore =
        1f -
          (
            abs(
              angleDifference -
                90f
            ) /
            55f
          ).coerceIn(
            0f,
            1f
          )

      val score =
        proximityScore *
          0.55f +
          lineLengthScore *
          0.25f +
          angleScore *
          0.20f

      if (
        score >
        bestScore
      ) {
        bestScore =
          score

        bestCorner =
          DetectedCorner(
            imageX =
              imageX,

            imageY =
              imageY,

            viewX =
              viewX,

            viewY =
              viewY,

            score =
              score
          )
      }
    }
  }

  return bestCorner
}

private fun infiniteLineIntersection(
  first: FloatArray,
  second: FloatArray
): Pair<Float, Float>? {
  val x1 =
    first[0]

  val y1 =
    first[1]

  val x2 =
    first[2]

  val y2 =
    first[3]

  val x3 =
    second[0]

  val y3 =
    second[1]

  val x4 =
    second[2]

  val y4 =
    second[3]

  val denominator =
    (
      x1 -
        x2
      ) *
      (
        y3 -
          y4
        ) -
      (
        y1 -
          y2
        ) *
      (
        x3 -
          x4
        )

  if (
    abs(
      denominator
    ) <
    0.0001f
  ) {
    return null
  }

  val determinantA =
    x1 *
      y2 -
      y1 *
      x2

  val determinantB =
    x3 *
      y4 -
      y3 *
      x4

  val x =
    (
      determinantA *
        (
          x3 -
            x4
          ) -
        (
          x1 -
            x2
          ) *
        determinantB
      ) /
      denominator

  val y =
    (
      determinantA *
        (
          y3 -
            y4
          ) -
        (
          y1 -
            y2
          ) *
        determinantB
      ) /
      denominator

  return Pair(
    x,
    y
  )
}

private fun distanceToSegment(
  px: Float,
  py: Float,
  segment: FloatArray
): Float {
  val x1 =
    segment[0]

  val y1 =
    segment[1]

  val x2 =
    segment[2]

  val y2 =
    segment[3]

  val dx =
    x2 -
      x1

  val dy =
    y2 -
      y1

  val lengthSquared =
    dx *
      dx +
      dy *
      dy

  if (
    lengthSquared <=
    0.0001f
  ) {
    return hypot(
      px - x1,
      py - y1
    )
  }

  val t =
    (
      (
        px -
          x1
        ) *
        dx +
        (
          py -
            y1
          ) *
        dy
      ) /
      lengthSquared

  val clamped =
    t.coerceIn(
      0f,
      1f
    )

  val closestX =
    x1 +
      clamped *
      dx

  val closestY =
    y1 +
      clamped *
      dy

  return hypot(
    px -
      closestX,
    py -
      closestY
  )
}

private fun segmentAngleDifferenceDegrees(
  first: FloatArray,
  second: FloatArray
): Float {
  val angleA =
    atan2(
      first[3] -
        first[1],
      first[2] -
        first[0]
    )

  val angleB =
    atan2(
      second[3] -
        second[1],
      second[2] -
        second[0]
    )

  var difference =
    abs(
      Math.toDegrees(
        (
          angleA -
            angleB
          ).toDouble()
      )
    ).toFloat()

  while (
    difference >
    180f
  ) {
    difference -=
      180f
  }

  if (
    difference >
    90f
  ) {
    difference =
      180f -
        difference
  }

  return difference
}

  private fun updateDisplayGeometry(
    session: Session
  ) {
    val activity =
      expoAppContext.currentActivity
        ?: return

    @Suppress("DEPRECATION")
    val rotation =
      activity
        .windowManager
        .defaultDisplay
        .rotation

    session.setDisplayGeometry(
      rotation,
      surfaceWidth,
      surfaceHeight
    )
  }

  private fun updateTrackingState(
    frame: Frame
  ) {
    val camera =
      frame.camera

    cameraTrackingState =
      camera.trackingState

    val state: String

    val reason: String?

    when (
      camera.trackingState
    ) {
      TrackingState.TRACKING -> {
        state =
          "tracking"

        reason =
          null
      }

      TrackingState.PAUSED -> {
        state =
          "limited"

        reason =
          camera
            .trackingFailureReason
            .name
            .lowercase()
      }

      TrackingState.STOPPED -> {
        state =
          "stopped"

        reason =
          null
      }

      else -> {
        state =
          "unknown"

        reason =
          null
      }
    }

    if (
      state != lastTrackingState ||
      reason != lastTrackingReason
    ) {
      lastTrackingState =
        state

      lastTrackingReason =
        reason

      emitTrackingState(
        state,
        reason
      )
    }
  }

  private fun updateCameraTextureCoordinates(
    frame: Frame
  ) {
    if (
      !frame.hasDisplayGeometryChanged()
    ) {
      return
    }

    frame.transformCoordinates2d(
      Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
      quadCoordsArray,
      Coordinates2d.TEXTURE_NORMALIZED,
      transformedTexCoords
    )

    quadTexCoords.position(
      0
    )

    quadTexCoords.put(
      transformedTexCoords
    )

    quadTexCoords.position(
      0
    )
  }

  private fun findDetectedCornerHit(
  frame: Frame
): HitResult? {
  val detectedCorner =
    latestDetectedCorner
      ?: return null

  val cornerAge =
    frame.timestamp -
      latestCornerTimestampNs

  if (
    cornerAge < 0L ||
    cornerAge > maximumCornerAgeNs
  ) {
    return null
  }

  return findUsableHit(
    frame,
    detectedCorner.viewX,
    detectedCorner.viewY
  )
}

private fun handleAutoItemMeasurement(
  frame: Frame
) {
  if (
    measurementComplete ||
    frame.timestamp == 0L ||
    frame.camera.trackingState != TrackingState.TRACKING
  ) {
    return
  }
  if (
    !itemScan.tapPending &&
    itemScan.seedPoint == null
  ) {
    emitTargetState("searching_item", 0f)
    return
  }
  val cameraPose = frame.camera.pose
  val previousCameraPose = itemScan.lastCameraPose
  if (previousCameraPose != null && itemScan.seedPoint != null) {
    itemScan.cameraMotionMeters += distanceBetween(previousCameraPose, cameraPose)
  }
  itemScan.lastCameraPose = cameraPose
  if (frameCounter % itemSampleIntervalFrames != 0) {
    return
  }
  val projectedSeed = itemScan.seedPoint?.let {
    projectWorldPointToView(it)
  }
  val centerX = (
    projectedSeed?.getOrNull(0) ?: itemScan.tapX
  ).coerceIn(0f, surfaceWidth.toFloat())
  val centerY = (
    projectedSeed?.getOrNull(1) ?: itemScan.tapY
  ).coerceIn(0f, surfaceHeight.toFloat())
  val centerHit = findDepthPointHit(frame, centerX, centerY)
  if (centerHit == null) {
    emitTargetState("item_depth_required", 0f)
    return
  }
  itemScan.tapPending = false
  itemScan.depthWarningEmitted = false
  val now = System.nanoTime()
  val seed = itemScan.seedPoint ?: poseToPoint(centerHit.hitPose).also {
    itemScan.seedPoint = it
    itemScan.scanStartNs = now
    itemScan.lastCameraPose = cameraPose
    itemScan.cameraMotionMeters = 0f
  }
  val radius = itemSampleRadiusDp * resources.displayMetrics.density
  val gridSteps = (itemSampleGridSize - 1).coerceAtLeast(1)
  val step = radius * 2f / gridSteps.toFloat()
  for (row in 0 until itemSampleGridSize) {
    val y = centerY - radius + row * step
    for (column in 0 until itemSampleGridSize) {
      val x = centerX - radius + column * step
      val hit = findDepthPointHit(frame, x, y) ?: continue
      val point = poseToPoint(hit.hitPose)
      if (isNearItemSeed(point, seed, cameraPose)) {
        addItemPoint(point)
      }
    }
  }
  itemScan.sampleFrames++
  val points = itemPointSnapshot()
  val estimate = ItemExtentEstimator.estimate(points)
  if (estimate == null) {
    emitTargetState("scanning_item", itemScanProgress(now, points.size))
    return
  }
  val previousEstimate = itemScan.lastEstimate
  itemScan.stableEstimateCount = if (
    previousEstimate != null && areItemEstimatesStable(previousEstimate, estimate)
  ) {
    itemScan.stableEstimateCount + 1
  } else {
    1
  }
  itemScan.lastEstimate = estimate
  val elapsedNs = (now - itemScan.scanStartNs).coerceAtLeast(0L)
  val enoughSamples = itemScan.sampleFrames >= itemMinimumSampleFrames &&
    estimate.sampleCount >= itemMinimumPointCount
  val enoughMotion = itemScan.cameraMotionMeters >= itemMinimumMotionMeters
  val stableLongEnough = itemScan.stableEstimateCount >= 2 &&
    elapsedNs >= itemMinimumScanDurationNs
  val timedOut = elapsedNs >= itemMaximumScanDurationNs
  if (enoughSamples && enoughMotion && (stableLongEnough || timedOut)) {
    itemExtentModel = estimate
    measurementComplete = true
    emitItemMeasurement(estimate)
    emitTargetState("complete", 1f)
  } else {
    emitTargetState("scanning_item", itemScanProgress(now, estimate.sampleCount))
  }
}

private fun findDepthPointHit(
  frame: Frame,
  x: Float,
  y: Float
): HitResult? {
  if (surfaceWidth <= 0 || surfaceHeight <= 0) {
    return null
  }
  val safeX = x.coerceIn(0f, surfaceWidth.toFloat())
  val safeY = y.coerceIn(0f, surfaceHeight.toFloat())
  return try {
    frame.hitTest(safeX, safeY).firstOrNull { hit ->
      val trackable = hit.trackable
      trackable is DepthPoint && trackable.trackingState == TrackingState.TRACKING
    }
  } catch (ignored: Exception) {
    null
  }
}

private fun poseToPoint(pose: Pose): FloatArray {
  return floatArrayOf(pose.tx(), pose.ty(), pose.tz())
}

private fun isNearItemSeed(
  point: FloatArray,
  seed: FloatArray,
  cameraPose: Pose
): Boolean {
  if (distanceBetweenPoints(point, seed) > itemSeedMaxDistanceMeters) {
    return false
  }
  val cameraPoint = poseToPoint(cameraPose)
  val seedDepth = distanceBetweenPoints(cameraPoint, seed)
  val sampleDepth = distanceBetweenPoints(cameraPoint, point)
  return kotlin.math.abs(sampleDepth - seedDepth) <= itemDepthWindowMeters
}

private fun addItemPoint(point: FloatArray) {
  val key = listOf(
    kotlin.math.round(point[0] / itemVoxelSizeMeters).toInt(),
    kotlin.math.round(point[1] / itemVoxelSizeMeters).toInt(),
    kotlin.math.round(point[2] / itemVoxelSizeMeters).toInt()
  ).joinToString(":")
  synchronized(measurementLock) {
    if (itemScan.voxelKeys.add(key)) {
      itemScan.points.add(point.copyOf())
    }
  }
}

private fun itemPointSnapshot(): List<FloatArray> {
  return synchronized(measurementLock) {
    itemScan.points.map { it.copyOf() }
  }
}

private fun distanceBetweenPoints(first: FloatArray, second: FloatArray): Float {
  val dx = first[0] - second[0]
  val dy = first[1] - second[1]
  val dz = first[2] - second[2]
  return sqrt(dx * dx + dy * dy + dz * dz)
}

private fun areItemEstimatesStable(
  previous: ItemExtentEstimate,
  current: ItemExtentEstimate
): Boolean {
  val previousExtents = floatArrayOf(
    previous.lengthMeters,
    previous.widthMeters,
    previous.heightMeters
  )
  val currentExtents = floatArrayOf(
    current.lengthMeters,
    current.widthMeters,
    current.heightMeters
  )
  return previousExtents.indices.all { index ->
    val scale = previousExtents[index].coerceAtLeast(0.025f)
    kotlin.math.abs(currentExtents[index] - previousExtents[index]) / scale < 0.12f
  }
}

private fun itemScanProgress(nowNs: Long, pointCount: Int): Float {
  val elapsedNs = (nowNs - itemScan.scanStartNs).coerceAtLeast(0L)
  val timeProgress = (elapsedNs.toDouble() / itemMaximumScanDurationNs.toDouble())
    .coerceIn(0.0, 1.0).toFloat()
  val sampleProgress = (itemScan.sampleFrames / itemMinimumSampleFrames.toFloat())
    .coerceIn(0f, 1f)
  val pointProgress = (pointCount / itemMinimumPointCount.toFloat()).coerceIn(0f, 1f)
  val motionProgress = (itemScan.cameraMotionMeters / itemMinimumMotionMeters)
    .coerceIn(0f, 1f)
  return min(
    0.98f,
    timeProgress * 0.25f + sampleProgress * 0.25f +
      pointProgress * 0.35f + motionProgress * 0.15f
  )
}

private fun emitItemMeasurement(model: ItemExtentEstimate) {
  val sampleConfidence = (model.sampleCount / 180f).coerceIn(0.35f, 1f)
  val motionConfidence = (itemScan.cameraMotionMeters / 0.08f).coerceIn(0.25f, 1f)
  val confidence = (sampleConfidence * 0.55f + motionConfidence * 0.45f)
    .coerceIn(0f, 0.95f)
  post {
    onItemMeasurement(
      mapOf<String, Any>(
        "kind" to "item_extents",
        "shapeFamily" to "unknown",
        "lengthCm" to model.lengthMeters * 100f,
        "widthCm" to model.widthMeters * 100f,
        "heightCm" to model.heightMeters * 100f,
        "lengthInches" to model.lengthMeters * 39.3700787f,
        "widthInches" to model.widthMeters * 39.3700787f,
        "heightInches" to model.heightMeters * 39.3700787f,
        "confidence" to confidence,
        "sampleCount" to model.sampleCount,
        "cameraMotionMeters" to itemScan.cameraMotionMeters
      )
    )
  }
}
private fun handleAutoTarget(
  frame: Frame
) {
  if (
    measurementComplete ||
    frame.timestamp == 0L ||
    frame.camera.trackingState !=
      TrackingState.TRACKING
  ) {
    return
  }

  if (
  measurementAnchors.size >= 3
) {
  /*
   * Three top-face corners are enough.
   *
   * Stop accepting new measurement points immediately.
   * While we wait for ARCore to establish the supporting
   * plane, keep trying to construct the cuboid instead.
   */
  clearTargetCandidate()

  if (
    cuboidModel == null
  ) {
    tryBuildMeasuredCuboid(
      frame
    )
  }

  return
}

  /*
   * Require a current visual corner detection.
   *
   * We do NOT allow the AR point to lock just because
   * the phone is being held still.
   */
  val detectedCorner =
    latestDetectedCorner

if (detectedCorner == null) {
  lostCornerFrames++

  if (
    lostCornerFrames >
    maximumLostCornerFrames
  ) {
    clearTargetCandidate()

    emitTargetState(
      "searching_corner",
      0f
    )
  }

  return
}

lostCornerFrames = 0

  /*
   * Never use a stale CV result.
   *
   * If the phone moved after OpenCV found the corner,
   * its screen coordinate may no longer correspond to
   * the same physical point.
   */
  val cornerAge =
    frame.timestamp -
      latestCornerTimestampNs

  if (
    cornerAge < 0L ||
    cornerAge > maximumCornerAgeNs
  ) {
    clearTargetCandidate()

    emitTargetState(
      "searching_corner",
      0f
    )

    return
  }

  /*
   * Raycast through the actual detected visual corner,
   * not through the center of the screen.
   */
  val hit =
    findDetectedCornerHit(
      frame
    )

  if (hit == null) {
    clearTargetCandidate()

    emitTargetState(
      "corner_no_depth",
      0f
    )

    return
  }

  val pose =
    hit.hitPose

  /*
   * Point A was just captured.
   *
   * Don't begin capturing B until the detected corner
   * has moved onto a different real-world location.
   */
  if (waitingForMoveAfterLock) {
    val previous =
      lastLockedPose

    if (
      previous != null &&
      distanceBetween(
        previous,
        pose
      ) < rearmDistanceMeters
    ) {
      clearTargetCandidate()

      emitTargetState(
        "move_to_next",
        0f
      )

      return
    }

    waitingForMoveAfterLock =
      false

    clearTargetCandidate()
  }

  /*
   * First stable observation of this detected corner.
   */
  if (targetSamples.isEmpty()) {
    targetSamples.add(
      pose
    )

    stableStartTimestampNs =
      frame.timestamp

    emitTargetState(
      "stabilizing",
      0f
    )

    return
  }

  val currentCenter =
    averagePose(
      targetSamples
    )

  val movement =
    distanceBetween(
      currentCenter,
      pose
    )

  /*
   * The visual/AR target jumped too far.
   *
   * Restart stabilization rather than accidentally
   * locking onto a different edge or corner.
   */
  if (
    movement >
    stabilityRadiusMeters
  ) {
    targetSamples.clear()

    targetSamples.add(
      pose
    )

    stableStartTimestampNs =
      frame.timestamp

    emitTargetState(
      "stabilizing",
      0f
    )

    return
  }

  targetSamples.add(
    pose
  )

  if (
    targetSamples.size >
    maximumStableSamples
  ) {
    targetSamples.removeAt(
      0
    )
  }

  val start =
    stableStartTimestampNs
      ?: frame.timestamp

  val elapsed =
    (
      frame.timestamp -
        start
    ).coerceAtLeast(
      0L
    )

  val progress =
    (
      elapsed.toDouble() /
        stableDurationNs.toDouble()
    )
      .coerceIn(
        0.0,
        1.0
      )
      .toFloat()

  emitTargetState(
    "stabilizing",
    progress
  )

  if (
    elapsed <
    stableDurationNs
  ) {
    return
  }

  if (
    targetSamples.size <
    minimumStableSamples
  ) {
    return
  }

  val averagedPose =
    averagePose(
      targetSamples
    )

  val maximumJitter =
    maximumDistanceFromPose(
      targetSamples,
      averagedPose
    )

  if (
    maximumJitter >
    stabilityRadiusMeters
  ) {
    clearTargetCandidate()

    emitTargetState(
      "stabilizing",
      0f
    )

    return
  }

  lockMeasurementPoint(
    averagedPose,
    hit,
    frame
  )
}

private fun tryBuildMeasuredCuboid(
  frame: Frame
) {
  if (
    measurementAnchors.size < 3 ||
    cuboidModel != null
  ) {
    return
  }

  val currentSession =
    session
      ?: return

  val originAnchor =
    measurementAnchors[0]

  val capturedPoses =
    synchronized(
      measurementLock
    ) {
      measurementCornerPoses.toList()
    }

  if (
    capturedPoses.size <
    3
  ) {
    return
  }

  val a =
    capturedPoses[0]

  val b =
    capturedPoses[1]

  val c =
    capturedPoses[2]

  val supportSurface =
    findSupportSurface(
      currentSession,
      frame,
      a,
      b,
      c
    )

  if (
    supportSurface == null
  ) {
    emitTargetState(
      "finding_support_plane",
      0f
    )

    return
  }

  val model =
    buildCuboidModel(
      originAnchor,
      supportSurface,
      a,
      b,
      c
    )
      ?: return

  cuboidModel =
    model

  cuboidOriginPose =
    a

  cuboidRevealStartNs =
    System.nanoTime()

  measurementComplete =
    true

  emitBoxMeasurement(
    model
  )

  emitTargetState(
    "complete",
    1f
  )
}

private fun findSupportSurface(
  session: Session,
  frame: Frame,
  a: Pose,
  b: Pose,
  c: Pose
): SupportSurface? {
  val plane =
    findSupportPlane(
      session,
      a,
      b,
      c
    )

  if (
    plane != null
  ) {
    val planePose =
      plane.centerPose

    return SupportSurface(
      origin =
        floatArrayOf(
          planePose.tx(),
          planePose.ty(),
          planePose.tz()
        ),

      normal =
        planePose.yAxis
    )
  }

  return findDepthSupportSurface(
    frame,
    a,
    b,
    c
  )
}

private fun findDepthSupportSurface(
  frame: Frame,
  a: Pose,
  b: Pose,
  c: Pose
): SupportSurface? {
  if (
    surfaceWidth <= 1 ||
    surfaceHeight <= 1
  ) {
    return null
  }

  val topCenter =
    floatArrayOf(
      (
        a.tx() +
          b.tx() +
          c.tx()
        ) / 3f,

      (
        a.ty() +
          b.ty() +
          c.ty()
        ) / 3f,

      (
        a.tz() +
          b.tz() +
          c.tz()
        ) / 3f
    )

  val projectedCorners =
    arrayOf(
      a,
      b,
      c
    ).map { pose ->
      projectWorldPointToView(
        floatArrayOf(
          pose.tx(),
          pose.ty(),
          pose.tz()
        )
      )
        ?: return null
    }

  var minX =
    Float.MAX_VALUE

  var maxX =
    -Float.MAX_VALUE

  var minY =
    Float.MAX_VALUE

  var maxY =
    -Float.MAX_VALUE

  projectedCorners.forEach { point ->
    minX =
      min(
        minX,
        point[0]
      )

    maxX =
      kotlin.math.max(
        maxX,
        point[0]
      )

    minY =
      min(
        minY,
        point[1]
      )

    maxY =
      kotlin.math.max(
        maxY,
        point[1]
      )
  }

  val footprintRadius =
    arrayOf(
      a,
      b,
      c
    ).maxOf { pose ->
      kotlin.math.hypot(
        pose.tx() -
          topCenter[0],
        pose.tz() -
          topCenter[2]
      )
    }
      .coerceAtLeast(
        0.08f
      )

  val margin =
    (
      kotlin.math.max(
        36f,
        (
          kotlin.math.max(
            maxX - minX,
            maxY - minY
          ) *
            0.20f
        )
      )
    ).coerceAtMost(
      150f
    )

  val maxHorizontalDistance =
    (
      footprintRadius *
        3.5f
    ).coerceIn(
      0.35f,
      1.5f
    )

  val left =
    (
      minX -
        margin
    ).coerceIn(
      0f,
      (
        surfaceWidth -
          1
      ).toFloat()
    )

  val right =
    (
      maxX +
        margin
    ).coerceIn(
      0f,
      (
        surfaceWidth -
          1
      ).toFloat()
    )

  val top =
    (
      minY -
        margin
    ).coerceIn(
      0f,
      (
        surfaceHeight -
          1
      ).toFloat()
    )

  val bottom =
    (
      maxY +
        margin
    ).coerceIn(
      0f,
      (
        surfaceHeight -
          1
      ).toFloat()
    )

  val centerX =
    (
      minX +
        maxX
      ) / 2f

  val centerY =
    (
      minY +
        maxY
      ) / 2f

  val sampleXs =
    floatArrayOf(
      left,
      centerX.coerceIn(
        0f,
        (
          surfaceWidth -
            1
        ).toFloat()
      ),
      right
    )

  val sampleYs =
    floatArrayOf(
      top,
      centerY.coerceIn(
        0f,
        (
          surfaceHeight -
            1
        ).toFloat()
      ),
      bottom
    )

  val supportSamples =
    mutableListOf<Pose>()

  for (sampleX in sampleXs) {
    for (sampleY in sampleYs) {
      /*
       * Do not sample the visible top face itself. The ring around
       * the projected footprint is where the table/floor is exposed.
       */
      if (
        sampleX > minX &&
        sampleX < maxX &&
        sampleY > minY &&
        sampleY < maxY
      ) {
        continue
      }

      val hitPose =
        findDepthSupportHit(
          frame,
          sampleX,
          sampleY,
          topCenter,
          maxHorizontalDistance
        )
          ?: continue

      supportSamples.add(
        hitPose
      )
    }
  }

  if (
    supportSamples.size <
    3
  ) {
    return null
  }

  val sortedHeights =
    supportSamples
      .map {
        it.ty()
      }
      .sorted()

  val surfaceY =
    sortedHeights[
      sortedHeights.size /
        2
    ]

  val inliers =
    supportSamples.filter { pose ->
      abs(
        pose.ty() -
          surfaceY
      ) <=
      0.035f
    }

  if (
    inliers.size <
    3
  ) {
    return null
  }

  var originX =
    0f

  var originZ =
    0f

  inliers.forEach { pose ->
    originX +=
      pose.tx()

    originZ +=
      pose.tz()
  }

  val count =
    inliers.size.toFloat()

  return SupportSurface(
    origin =
      floatArrayOf(
        originX /
          count,
        surfaceY,
        originZ /
          count
      ),

    normal =
      floatArrayOf(
        0f,
        1f,
        0f
      )
  )
}

private fun findDepthSupportHit(
  frame: Frame,
  x: Float,
  y: Float,
  topCenter: FloatArray,
  maxHorizontalDistance: Float
): Pose? {
  val hits =
    try {
      frame.hitTest(
        x,
        y
      )
    } catch (
      ignored: Exception
    ) {
      return null
    }

  for (hit in hits) {
    val trackable =
      hit.trackable

    val usable =
      when (trackable) {
        is Plane -> {
          trackable.trackingState ==
            TrackingState.TRACKING &&
            trackable.type ==
            Plane.Type.HORIZONTAL_UPWARD_FACING
        }

        is DepthPoint -> {
          trackable.trackingState ==
            TrackingState.TRACKING
        }

        else -> false
      }

    if (
      !usable
    ) {
      continue
    }

    val pose =
      hit.hitPose

    /*
     * A valid support hit must be below the captured top face.
     */
    if (
      pose.ty() >=
      topCenter[1] -
        0.025f
    ) {
      continue
    }

    val horizontalDistance =
      kotlin.math.hypot(
        pose.tx() -
          topCenter[0],
        pose.tz() -
          topCenter[2]
      )

    if (
      horizontalDistance >
      maxHorizontalDistance
    ) {
      continue
    }

    return pose
  }

  return null
}

private fun findSupportPlane(
  session: Session,
  a: Pose,
  b: Pose,
  c: Pose
): Plane? {
  val topCenter =
    Vec3(
      (
        a.tx() +
          b.tx() +
          c.tx()
        ) / 3f,

      (
        a.ty() +
          b.ty() +
          c.ty()
        ) / 3f,

      (
        a.tz() +
          b.tz() +
          c.tz()
        ) / 3f
    )

  var bestPlane:
    Plane? = null

  var bestDistance =
    Float.MAX_VALUE

  val planes =
    session.getAllTrackables(
      Plane::class.java
    )

  for (plane in planes) {
    if (
      plane.trackingState !=
        TrackingState.TRACKING
    ) {
      continue
    }

    if (
      plane.subsumedBy !=
        null
    ) {
      continue
    }

    if (
      plane.type !=
        Plane.Type.HORIZONTAL_UPWARD_FACING
    ) {
      continue
    }

    val planePose =
      plane.centerPose

    val normal =
      planePose.yAxis

    val planeCenter =
      Vec3(
        planePose.tx(),
        planePose.ty(),
        planePose.tz()
      )

    val toTop =
      floatArrayOf(
        topCenter.x -
          planeCenter.x,

        topCenter.y -
          planeCenter.y,

        topCenter.z -
          planeCenter.z
      )

    val signedDistance =
      dot(
        toTop,
        normal
      )

    /*
     * Package must be above the supporting surface.
     *
     * Ignore near-zero planes (likely the top face itself)
     * and ridiculous distances.
     */
    if (
      signedDistance < 0.025f ||
      signedDistance > 1.5f
    ) {
      continue
    }

    val projected =
      Pose.makeTranslation(
        topCenter.x -
          normal[0] *
          signedDistance,

        topCenter.y -
          normal[1] *
          signedDistance,

        topCenter.z -
          normal[2] *
          signedDistance
      )

    if (
      !plane.isPoseInPolygon(
        projected
      ) &&
      !plane.isPoseInExtents(
        projected
      )
    ) {
      continue
    }

    /*
     * Pick the closest upward-facing plane below
     * the package.
     */
    if (
      signedDistance <
      bestDistance
    ) {
      bestDistance =
        signedDistance

      bestPlane =
        plane
    }
  }

  return bestPlane
}

private fun buildCuboidModel(
  originAnchor: Anchor,
  supportSurface: SupportSurface,
  capturedA: Pose,
  capturedB: Pose,
  capturedC: Pose
): CuboidModel? {
  val normal =
    supportSurface.normal

  val planeOrigin =
    supportSurface.origin

  val rawA =
    floatArrayOf(
      capturedA.tx(),
      capturedA.ty(),
      capturedA.tz()
    )

  val rawB =
    floatArrayOf(
      capturedB.tx(),
      capturedB.ty(),
      capturedB.tz()
    )

  val rawC =
    floatArrayOf(
      capturedC.tx(),
      capturedC.ty(),
      capturedC.tz()
    )

  val heightA =
    distanceAlongNormal(
      planeOrigin,
      rawA,
      normal
    )

  val heightB =
    distanceAlongNormal(
      planeOrigin,
      rawB,
      normal
    )

  val heightC =
    distanceAlongNormal(
      planeOrigin,
      rawC,
      normal
    )

  val height =
    (
      heightA +
        heightB +
        heightC
      ) / 3f

  if (
    height < 0.025f ||
    height > 1.5f
  ) {
    return null
  }

  /*
   * Bottom A is raw A projected onto the support plane.
   */
  val bottomA =
    subtract(
      rawA,
      scale(
        normal,
        heightA
      )
    )

  val topA =
    add(
      bottomA,
      scale(
        normal,
        height
      )
    )

  /*
   * Project AB and AC into the support plane.
   */
  var axis1 =
    projectVectorOntoPlane(
      subtract(
        rawB,
        rawA
      ),
      normal
    )

  var axis2Raw =
    projectVectorOntoPlane(
      subtract(
        rawC,
        rawA
      ),
      normal
    )

  var length =
    vectorLength(
      axis1
    )

  if (
    length < 0.05f
  ) {
    return null
  }

  axis1 =
    normalize(
      axis1
    )

  /*
   * Gram-Schmidt:
   *
   * Force the second box edge to be truly perpendicular
   * to the first while staying on the support plane.
   */
  axis2Raw =
    subtract(
      axis2Raw,
      scale(
        axis1,
        dot(
          axis2Raw,
          axis1
        )
      )
    )

  var width =
    vectorLength(
      axis2Raw
    )

  if (
    width < 0.05f
  ) {
    return null
  }

  var axis2 =
    normalize(
      axis2Raw
    )

  /*
   * Label the larger base dimension as Length.
   */
  if (
    width >
    length
  ) {
    val tempLength =
      length

    length =
      width

    width =
      tempLength

    val tempAxis =
      axis1

    axis1 =
      axis2

    axis2 =
      tempAxis
  }

  val topB =
    add(
      topA,
      scale(
        axis1,
        length
      )
    )

  val topC =
    add(
      topA,
      scale(
        axis2,
        width
      )
    )

  val topD =
    add(
      topB,
      scale(
        axis2,
        width
      )
    )

  val down =
    scale(
      normal,
      -height
    )

  val bottomB =
    add(
      topB,
      down
    )

  val bottomC =
    add(
      topC,
      down
    )

  val bottomD =
    add(
      topD,
      down
    )

  val worldCorners =
    arrayOf(
      topA,
      topB,
      topC,
      topD,

      bottomA,
      bottomB,
      bottomC,
      bottomD
    )

  /*
   * Convert everything to coordinates relative to
   * anchor A. The anchor then keeps the entire cuboid
   * spatially attached while ARCore refines the world.
   */
  /*
   * The first captured pose is the origin pose at lock time. Use it
   * to freeze local geometry, then let the persistent anchor carry the
   * complete cuboid through camera movement and relocalization.
   */
  val inverseAnchor =
    capturedA.inverse()

  val localCorners =
    Array(
      worldCorners.size
    ) { index ->
      inverseAnchor.transformPoint(
        worldCorners[index]
      )
    }

  val edges =
    intArrayOf(
      // top
      0, 1,
      1, 3,
      3, 2,
      2, 0,

      // bottom
      4, 5,
      5, 7,
      7, 6,
      6, 4,

      // vertical
      0, 4,
      1, 5,
      2, 6,
      3, 7
    )

  val lineVertices =
    FloatArray(
      edges.size *
        3
    )

  var output =
    0

  for (cornerIndex in edges) {
    val corner =
      localCorners[
        cornerIndex
      ]

    lineVertices[
      output++
    ] =
      corner[0]

    lineVertices[
      output++
    ] =
      corner[1]

    lineVertices[
      output++
    ] =
      corner[2]
  }

  return CuboidModel(
    corners =
      localCorners,

    lineVertices =
      lineVertices,

    lengthMeters =
      length,

    widthMeters =
      width,

    heightMeters =
      height,

    lengthEdgeStart =
      localCorners[0],

    lengthEdgeEnd =
      localCorners[1],

    widthEdgeStart =
      localCorners[0],

    widthEdgeEnd =
      localCorners[2],

    heightEdgeStart =
      localCorners[0],

    heightEdgeEnd =
      localCorners[4]
  )
}

private fun add(
  a: FloatArray,
  b: FloatArray
): FloatArray {
  return floatArrayOf(
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2]
  )
}

private fun subtract(
  a: FloatArray,
  b: FloatArray
): FloatArray {
  return floatArrayOf(
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2]
  )
}

private fun scale(
  vector: FloatArray,
  amount: Float
): FloatArray {
  return floatArrayOf(
    vector[0] * amount,
    vector[1] * amount,
    vector[2] * amount
  )
}

private fun normalize(
  vector: FloatArray
): FloatArray {
  val length =
    vectorLength(
      vector
    )

  if (
    length <= 0.00001f
  ) {
    return floatArrayOf(
      0f,
      0f,
      0f
    )
  }

  return scale(
    vector,
    1f / length
  )
}

private fun projectVectorOntoPlane(
  vector: FloatArray,
  planeNormal: FloatArray
): FloatArray {
  return subtract(
    vector,
    scale(
      planeNormal,
      dot(
        vector,
        planeNormal
      )
    )
  )
}

private fun distanceAlongNormal(
  planeOrigin: FloatArray,
  point: FloatArray,
  normal: FloatArray
): Float {
  return dot(
    subtract(
      point,
      planeOrigin
    ),
    normal
  )
}

private fun findReticleHit(
  frame: Frame
): HitResult? {
  val detectedCorner =
    latestDetectedCorner
      ?: return null

  val cornerAge =
    frame.timestamp -
      latestCornerTimestampNs

  /*
   * Never use an old visual detection.
   *
   * If the phone moved after OpenCV detected the corner,
   * that old VIEW coordinate may no longer represent the
   * same physical point.
   */
  if (
    cornerAge < 0L ||
    cornerAge > maximumCornerAgeNs
  ) {
    return null
  }

  /*
   * IMPORTANT:
   *
   * We're no longer hit-testing the center reticle.
   *
   * detectedCorner.viewX / viewY came from:
   *
   * OpenCV corner in IMAGE_PIXELS
   *        ↓
   * Frame.transformCoordinates2d()
   *        ↓
   * Coordinates2d.VIEW
   *
   * Those VIEW coordinates are exactly what
   * Frame.hitTest(x, y) expects.
   */
  return findUsableHit(
    frame,
    detectedCorner.viewX,
    detectedCorner.viewY
  )
}

  private fun findUsableHit(
    frame: Frame,
    x: Float,
    y: Float
  ): HitResult? {
    val usableHits =
      frame.hitTest(
        x,
        y
      ).filter { hit ->
        when (val trackable = hit.trackable) {
          is Plane -> {
            trackable.trackingState ==
              TrackingState.TRACKING &&
              trackable.type ==
              Plane.Type.HORIZONTAL_UPWARD_FACING &&
              trackable.isPoseInPolygon(
                hit.hitPose
              )
          }

          is Point -> {
            trackable.trackingState ==
              TrackingState.TRACKING
          }

          is DepthPoint -> {
            trackable.trackingState ==
              TrackingState.TRACKING
          }

          else -> false
        }
      }

    /*
     * DepthPoint is the only hit type here that can land on the actual
     * package surface when the large bed/floor plane is also visible.
     * Prefer it, then a horizontal plane, then a feature point.
     */
    return usableHits.firstOrNull {
      it.trackable is DepthPoint
    }
      ?: usableHits.firstOrNull {
        it.trackable is Plane
      }
      ?: usableHits.firstOrNull {
        it.trackable is Point
      }
  }

  private fun averagePose(
  poses: List<Pose>
): Pose {
  if (poses.isEmpty()) {
    return Pose.IDENTITY
  }

  var x =
    0.0f

  var y =
    0.0f

  var z =
    0.0f

  poses.forEach { pose ->
    x += pose.tx()
    y += pose.ty()
    z += pose.tz()
  }

  val count =
    poses.size.toFloat()

  return Pose.makeTranslation(
    x / count,
    y / count,
    z / count
  )
}

private fun maximumDistanceFromPose(
  poses: List<Pose>,
  center: Pose
): Float {
  var maximum =
    0.0f

  poses.forEach { pose ->
    val distance =
      distanceBetween(
        center,
        pose
      )

    if (
      distance >
      maximum
    ) {
      maximum =
        distance
    }
  }

  return maximum
}

private fun lockMeasurementPoint(
  pose: Pose,
  hit: HitResult,
  frame: Frame
) {
  val currentSession =
    session

  if (currentSession == null) {
    emitError(
      "NO_AR_SESSION",
      "The AR session is not available."
    )

    return
  }

  if (
  measurementAnchors.size >= 3
) {
  clearTargetCandidate()

  if (
    cuboidModel == null
  ) {
    tryBuildMeasuredCuboid(
      frame
    )
  }

  return
}

  /*
   * Prevent a second/third point from landing almost
   * directly on the first point.
   */
  if (
    measurementAnchors.isNotEmpty()
  ) {
    val firstPose =
      measurementAnchors[0].pose

    val distanceFromFirst =
      distanceBetween(
        firstPose,
        pose
      )

    if (
      distanceFromFirst <
      0.05f
    ) {
      clearTargetCandidate()

      waitingForMoveAfterLock =
        true

      emitTargetState(
        "move_to_next",
        0f
      )

      return
    }
  }

  /*
   * Point 3 must represent the adjacent top edge,
   * not another point along AB.
   */
  if (
    measurementAnchors.size == 2
  ) {
    val a =
      measurementAnchors[0].pose

    val b =
      measurementAnchors[1].pose

    if (
      !isReasonableThirdCorner(
        a,
        b,
        pose
      )
    ) {
      clearTargetCandidate()

      emitTargetState(
        "third_point_not_perpendicular",
        0f
      )

      return
    }
  }

  val anchor =
    try {
      /*
       * DepthPoint trackables are short-lived samples rather than a
       * persistent surface. Use a session anchor for those points so the
       * registered corner survives while ARCore builds the support surface.
       * Plane anchors remain attached to their detected plane.
       */
      if (
        hit.trackable is DepthPoint
      ) {
        currentSession.createAnchor(
          pose
        )
      } else {
        hit.trackable.createAnchor(
          pose
        )
      }
    } catch (
      error: Exception
    ) {
      /*
       * A trackable can be invalidated between the hit test and lock.
       * Fall back to a session anchor so a transient race does not lose
       * the user's point.
       */
      try {
        currentSession.createAnchor(
          pose
        )
      } catch (
        fallbackError: Exception
      ) {
        emitError(
          "ANCHOR_FAILED",
          fallbackError.message
            ?: error.message
            ?: "KeepFlip could not anchor the measurement point."
        )

        return
      }
    }

  val anchorPose =
    anchor.pose

  val pointIndex =
    synchronized(
      measurementLock
    ) {
      val index =
        measurementAnchors.size

      measurementAnchors.add(
        anchor
      )

      measurementCornerPoses.add(
        anchorPose
      )

      measurementAnchorLastKnownPoses[anchor] =
        anchorPose

      index
    }

  lastLockedPose =
    anchorPose

  clearTargetCandidate()

  emitPointPlaced(
    pointIndex,
    anchorPose.tx(),
    anchorPose.ty(),
    anchorPose.tz()
  )

  /*
   * We now need THREE captured top-face corners.
   */
  if (
    measurementAnchors.size < 3
  ) {
    waitingForMoveAfterLock =
      true

    emitTargetState(
      "locked",
      1f
    )

    return
  }

  /*
   * Stop accepting additional corners.
   * Height is now inferred from the tracked support plane.
   */
  waitingForMoveAfterLock =
    false

  emitTargetState(
    "finding_support_plane",
    0f
  )
}

private fun isReasonableThirdCorner(
  a: Pose,
  b: Pose,
  c: Pose
): Boolean {
  val ab =
    floatArrayOf(
      b.tx() - a.tx(),
      b.ty() - a.ty(),
      b.tz() - a.tz()
    )

  val ac =
    floatArrayOf(
      c.tx() - a.tx(),
      c.ty() - a.ty(),
      c.tz() - a.tz()
    )

  val abLength =
    vectorLength(
      ab
    )

  val acLength =
    vectorLength(
      ac
    )

  if (
    abLength < 0.05f ||
    acLength < 0.05f
  ) {
    return false
  }

  val cosine =
    (
      dot(
        ab,
        ac
      ) /
        (
          abLength *
            acLength
        )
    ).coerceIn(
      -1f,
      1f
    )

  /*
   * Reject only an effectively collinear third corner.
   *
   * The cuboid builder later projects the points onto the support
   * plane and orthogonalizes the two base axes. This loose cosine
   * bound therefore rejects only near-line captures while allowing
   * normal ARCore and visual-corner jitter.
   */
  return kotlin.math.abs(
    cosine
  ) < 0.90f
}

private fun dot(
  a: FloatArray,
  b: FloatArray
): Float {
  return (
    a[0] * b[0] +
      a[1] * b[1] +
      a[2] * b[2]
  )
}

private fun vectorLength(
  vector: FloatArray
): Float {
  return kotlin.math.sqrt(
    dot(
      vector,
      vector
    )
  )
}

  private fun distanceBetween(
    first: Pose,
    second: Pose
  ): Float {
    val dx =
      second.tx() -
        first.tx()

    val dy =
      second.ty() -
        first.ty()

    val dz =
      second.tz() -
        first.tz()

    return sqrt(
      dx * dx +
        dy * dy +
        dz * dz
    )
  }

  private fun emitTrackingState(
    state: String,
    reason: String? = null
  ) {
    val payload =
      mutableMapOf<String, Any>(
        "state" to state
      )

    reason?.let {
      payload["reason"] =
        it
    }

    post {
      onTrackingState(
        payload
      )
    }
  }

  private fun emitPointPlaced(
    index: Int,
    x: Float,
    y: Float,
    z: Float
  ) {
    val payload =
      mapOf<String, Any>(
        "index" to index,
        "x" to x,
        "y" to y,
        "z" to z
      )

    post {
      onPointPlaced(
        payload
      )
    }
  }

  private fun emitMeasurement(
    distanceMeters: Float
  ) {
    val payload =
      mapOf<String, Any>(
        "distanceMeters" to
          distanceMeters,

        "distanceCm" to
          distanceMeters * 100.0f,

        "distanceInches" to
          distanceMeters * 39.3700787f
      )

    post {
      onMeasurement(
        payload
      )
    }
  }

  private fun emitError(
    code: String,
    message: String
  ) {
    val payload =
      mapOf<String, Any>(
        "code" to code,
        "message" to message
      )

    post {
      onError(
        payload
      )
    }
  }

  private fun emitTargetState(
  state: String,
  progress: Float
) {
  /*
   * Don't hammer React Native with 60 identical events/sec.
   */
  val bucket =
    (
      progress *
        20f
      ).toInt()

  if (
    state ==
    lastTargetState &&
    bucket ==
    lastTargetProgressBucket
  ) {
    return
  }

  lastTargetState =
    state

  lastTargetProgressBucket =
    bucket

  val payload =
    mapOf<String, Any>(
      "state" to state,
      "progress" to progress
    )

  post {
    onTargetState(
      payload
    )
  }
}

private fun emitDetectedCorner(
  corner: DetectedCorner
) {
  val payload =
    mapOf<String, Any>(
      "x" to corner.viewX,
      "y" to corner.viewY,
      "score" to corner.score,
      "imageX" to corner.imageX,
      "imageY" to corner.imageY
    )

  post {
    onDetectedCorner(
      payload
    )
  }
}

  private fun clearTargetCandidate() {
  targetSamples.clear()

  stableStartTimestampNs =
    null
}

private fun clearItemScan() {
  synchronized(
    measurementLock
  ) {
    itemScan.points.clear()
    itemScan.voxelKeys.clear()
  }
  itemScan.seedPoint = null
  itemScan.scanStartNs = 0L
  itemScan.lastSampleNs = 0L
  itemScan.sampleFrames = 0
  itemScan.cameraMotionMeters = 0f
  itemScan.lastCameraPose = null
  itemScan.lastEstimate = null
  itemScan.stableEstimateCount = 0
  itemScan.depthWarningEmitted = false
  itemScan.tapX = 0f
  itemScan.tapY = 0f
  itemScan.tapPending = false
}
  private fun createExternalCameraTexture():
    Int {
    val textures =
      IntArray(1)

    GLES20.glGenTextures(
      1,
      textures,
      0
    )

    val textureId =
      textures[0]

    GLES20.glBindTexture(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      textureId
    )

    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_MIN_FILTER,
      GLES20.GL_LINEAR
    )

    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_MAG_FILTER,
      GLES20.GL_LINEAR
    )

    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_WRAP_S,
      GLES20.GL_CLAMP_TO_EDGE
    )

    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_WRAP_T,
      GLES20.GL_CLAMP_TO_EDGE
    )

    GLES20.glBindTexture(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      0
    )

    return textureId
  }

  private fun createCameraProgram():
    Int {
    val vertexShader =
      compileShader(
        GLES20.GL_VERTEX_SHADER,
        """
        attribute vec2 a_Position;
        attribute vec2 a_TexCoord;

        varying vec2 v_TexCoord;

        void main() {
          gl_Position =
            vec4(
              a_Position,
              0.0,
              1.0
            );

          v_TexCoord =
            a_TexCoord;
        }
        """.trimIndent()
      )

    val fragmentShader =
      compileShader(
        GLES20.GL_FRAGMENT_SHADER,
        """
        #extension GL_OES_EGL_image_external : require

        precision mediump float;

        uniform samplerExternalOES u_CameraTexture;

        varying vec2 v_TexCoord;

        void main() {
          gl_FragColor =
            texture2D(
              u_CameraTexture,
              v_TexCoord
            );
        }
        """.trimIndent()
      )

    val program =
      GLES20.glCreateProgram()

    GLES20.glAttachShader(
      program,
      vertexShader
    )

    GLES20.glAttachShader(
      program,
      fragmentShader
    )

    GLES20.glLinkProgram(
      program
    )

    val linkStatus =
      IntArray(1)

    GLES20.glGetProgramiv(
      program,
      GLES20.GL_LINK_STATUS,
      linkStatus,
      0
    )

    if (
      linkStatus[0] !=
      GLES20.GL_TRUE
    ) {
      val log =
        GLES20.glGetProgramInfoLog(
          program
        )

      GLES20.glDeleteProgram(
        program
      )

      throw RuntimeException(
        "AR camera shader link failed: $log"
      )
    }

    GLES20.glDeleteShader(
      vertexShader
    )

    GLES20.glDeleteShader(
      fragmentShader
    )

    return program
  }

  private fun compileShader(
    type: Int,
    source: String
  ): Int {
    val shader =
      GLES20.glCreateShader(
        type
      )

    GLES20.glShaderSource(
      shader,
      source
    )

    GLES20.glCompileShader(
      shader
    )

    val compileStatus =
      IntArray(1)

    GLES20.glGetShaderiv(
      shader,
      GLES20.GL_COMPILE_STATUS,
      compileStatus,
      0
    )

    if (
      compileStatus[0] !=
      GLES20.GL_TRUE
    ) {
      val log =
        GLES20.glGetShaderInfoLog(
          shader
        )

      GLES20.glDeleteShader(
        shader
      )

      throw RuntimeException(
        "AR camera shader compilation failed: $log"
      )
    }

    return shader
  }

  private fun drawCameraBackground() {
    if (
      shaderProgram == 0 ||
      cameraTextureId == 0
    ) {
      return
    }

    GLES20.glDisable(
      GLES20.GL_DEPTH_TEST
    )

    GLES20.glDepthMask(
      false
    )

    GLES20.glUseProgram(
      shaderProgram
    )

    GLES20.glActiveTexture(
      GLES20.GL_TEXTURE0
    )

    GLES20.glBindTexture(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      cameraTextureId
    )

    GLES20.glUniform1i(
      cameraTextureUniform,
      0
    )

    quadCoords.position(
      0
    )

    quadTexCoords.position(
      0
    )

    GLES20.glVertexAttribPointer(
      positionAttribute,
      2,
      GLES20.GL_FLOAT,
      false,
      0,
      quadCoords
    )

    GLES20.glVertexAttribPointer(
      texCoordAttribute,
      2,
      GLES20.GL_FLOAT,
      false,
      0,
      quadTexCoords
    )

    GLES20.glEnableVertexAttribArray(
      positionAttribute
    )

    GLES20.glEnableVertexAttribArray(
      texCoordAttribute
    )

    GLES20.glDrawArrays(
      GLES20.GL_TRIANGLE_STRIP,
      0,
      4
    )

    GLES20.glDisableVertexAttribArray(
      positionAttribute
    )

    GLES20.glDisableVertexAttribArray(
      texCoordAttribute
    )

    GLES20.glBindTexture(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      0
    )

    GLES20.glDepthMask(
      true
    )

    GLES20.glEnable(
      GLES20.GL_DEPTH_TEST
    )
  }

  private fun createFloatBuffer(
    values: FloatArray
  ): FloatBuffer {
    return ByteBuffer
      .allocateDirect(
        values.size * 4
      )
      .order(
        ByteOrder.nativeOrder()
      )
      .asFloatBuffer()
      .apply {
        put(values)
        position(0)
      }
  }
}