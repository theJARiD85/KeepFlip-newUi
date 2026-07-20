package expo.modules.keepfliplocalvision

import java.nio.FloatBuffer
import java.util.ArrayDeque
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal fun extractSubjectContour(
  mask: FloatBuffer,
  maskWidth: Int,
  maskHeight: Int
): List<Double> = ForegroundMaskContourExtractor.extract(mask, maskWidth, maskHeight)

/**
 * Converts a tightly packed confidence mask into a lightweight, normalized outline.
 *
 * The returned list contains flat x/y pairs in the 0..1 range. The final pair repeats
 * the first pair so callers can draw the result as a closed Skia path without adding
 * an extra segment themselves.
 */
object ForegroundMaskContourExtractor {
  private const val DEFAULT_MAX_EDGE = 160
  private const val DEFAULT_THRESHOLD = 0.5f
  private const val DEFAULT_SIMPLIFICATION_TOLERANCE = 0.0065

  private data class GridEdge(
    val start: Int,
    val end: Int,
    val direction: Int
  )

  private data class Point(
    val x: Double,
    val y: Double
  )

  private data class IndexRange(
    val start: Int,
    val end: Int
  )

  /**
   * @param confidenceMask row-major foreground confidence values. Its position is
   * preserved and treated as the first mask value.
   * @param threshold values at or above this confidence are foreground.
   * @param maxEdge longest edge used while extracting the contour.
   * @param simplificationTolerance normalized Ramer-Douglas-Peucker tolerance.
   */
  fun extract(
    confidenceMask: FloatBuffer,
    maskWidth: Int,
    maskHeight: Int,
    threshold: Float = DEFAULT_THRESHOLD,
    maxEdge: Int = DEFAULT_MAX_EDGE,
    simplificationTolerance: Double = DEFAULT_SIMPLIFICATION_TOLERANCE
  ): List<Double> {
    require(maskWidth > 0 && maskHeight > 0) { "Mask dimensions must be positive." }
    require(maxEdge >= 8) { "maxEdge must be at least 8." }
    require(!threshold.isNaN() && !threshold.isInfinite() && threshold in 0f..1f) {
      "threshold must be a finite value between 0 and 1."
    }
    require(
      !simplificationTolerance.isNaN() &&
        !simplificationTolerance.isInfinite() &&
        simplificationTolerance >= 0.0
    ) { "simplificationTolerance must be a finite, non-negative value." }

    val sourceSize = maskWidth.toLong() * maskHeight.toLong()
    require(sourceSize <= Int.MAX_VALUE) { "The confidence mask is too large." }
    require(confidenceMask.remaining().toLong() >= sourceSize) {
      "The confidence buffer is shorter than maskWidth * maskHeight."
    }

    val longestSourceEdge = max(maskWidth, maskHeight)
    val scale = if (longestSourceEdge <= maxEdge) {
      1.0
    } else {
      maxEdge.toDouble() / longestSourceEdge.toDouble()
    }
    val contourWidth = max(1, (maskWidth * scale).roundToInt())
    val contourHeight = max(1, (maskHeight * scale).roundToInt())
    val foreground = downsampleAndThreshold(
      confidenceMask,
      maskWidth,
      maskHeight,
      contourWidth,
      contourHeight,
      threshold
    )

    val componentLabels = IntArray(foreground.size)
    val selectedComponent = selectComponent(
      foreground,
      contourWidth,
      contourHeight,
      componentLabels
    )
    if (selectedComponent == 0) {
      return emptyList()
    }

    val boundary = traceLargestBoundary(
      componentLabels,
      selectedComponent,
      contourWidth,
      contourHeight
    )
    if (boundary.size < 3) {
      return emptyList()
    }

    val normalized = boundary.map { point ->
      Point(
        x = point.x / contourWidth.toDouble(),
        y = point.y / contourHeight.toDouble()
      )
    }
    val simplified = simplifyClosed(normalized, simplificationTolerance)
    if (simplified.size < 3) {
      return emptyList()
    }

    val output = ArrayList<Double>((simplified.size + 1) * 2)
    simplified.forEach { point ->
      output.add(point.x.coerceIn(0.0, 1.0))
      output.add(point.y.coerceIn(0.0, 1.0))
    }
    output.add(simplified.first().x.coerceIn(0.0, 1.0))
    output.add(simplified.first().y.coerceIn(0.0, 1.0))
    return output
  }

  private fun downsampleAndThreshold(
    source: FloatBuffer,
    sourceWidth: Int,
    sourceHeight: Int,
    targetWidth: Int,
    targetHeight: Int,
    threshold: Float
  ): BooleanArray {
    val view = source.duplicate()
    val sourceOffset = view.position()
    val result = BooleanArray(targetWidth * targetHeight)

    for (targetY in 0 until targetHeight) {
      val sourceTop = targetY * sourceHeight / targetHeight
      val sourceBottom = max(sourceTop + 1, (targetY + 1) * sourceHeight / targetHeight)

      for (targetX in 0 until targetWidth) {
        val sourceLeft = targetX * sourceWidth / targetWidth
        val sourceRight = max(sourceLeft + 1, (targetX + 1) * sourceWidth / targetWidth)
        var confidenceSum = 0.0
        var sampleCount = 0

        for (sourceY in sourceTop until sourceBottom) {
          val rowOffset = sourceOffset + sourceY * sourceWidth
          for (sourceX in sourceLeft until sourceRight) {
            val confidence = view.get(rowOffset + sourceX)
            if (!confidence.isNaN() && !confidence.isInfinite()) {
              confidenceSum += confidence.toDouble().coerceIn(0.0, 1.0)
              sampleCount += 1
            }
          }
        }

        val averageConfidence = if (sampleCount == 0) 0.0 else confidenceSum / sampleCount
        result[targetY * targetWidth + targetX] = averageConfidence >= threshold.toDouble()
      }
    }

    return result
  }

  /** Labels four-connected components and returns the best component label. */
  private fun selectComponent(
    foreground: BooleanArray,
    width: Int,
    height: Int,
    labels: IntArray
  ): Int {
    val queue = IntArray(foreground.size)
    var nextLabel = 1
    var bestLabel = 0
    var bestArea = 0
    var bestScore = Double.NEGATIVE_INFINITY

    for (seed in foreground.indices) {
      if (!foreground[seed] || labels[seed] != 0) {
        continue
      }

      val label = nextLabel++
      var head = 0
      var tail = 0
      var area = 0
      var sumX = 0.0
      var sumY = 0.0
      labels[seed] = label
      queue[tail++] = seed

      while (head < tail) {
        val index = queue[head++]
        val x = index % width
        val y = index / width
        area += 1
        sumX += x + 0.5
        sumY += y + 0.5

        if (x > 0) {
          tail = enqueueIfForeground(index - 1, label, foreground, labels, queue, tail)
        }
        if (x + 1 < width) {
          tail = enqueueIfForeground(index + 1, label, foreground, labels, queue, tail)
        }
        if (y > 0) {
          tail = enqueueIfForeground(index - width, label, foreground, labels, queue, tail)
        }
        if (y + 1 < height) {
          tail = enqueueIfForeground(index + width, label, foreground, labels, queue, tail)
        }
      }

      val centerX = sumX / area.toDouble() / width.toDouble()
      val centerY = sumY / area.toDouble() / height.toDouble()
      val normalizedCenterDistance = min(1.0, hypot(centerX - 0.5, centerY - 0.5) / hypot(0.5, 0.5))
      val centerAffinity = 1.0 - normalizedCenterDistance

      // Area remains dominant; centering can break close contests without letting
      // a tiny central speck beat the actual subject.
      val score = area.toDouble() * (0.78 + 0.22 * centerAffinity)
      if (score > bestScore || (score == bestScore && area > bestArea)) {
        bestScore = score
        bestArea = area
        bestLabel = label
      }
    }

    return bestLabel
  }

  private fun enqueueIfForeground(
    index: Int,
    label: Int,
    foreground: BooleanArray,
    labels: IntArray,
    queue: IntArray,
    tail: Int
  ): Int {
    if (!foreground[index] || labels[index] != 0) {
      return tail
    }
    labels[index] = label
    queue[tail] = index
    return tail + 1
  }

  /**
   * Builds clockwise grid edges with foreground on the right, chains every loop,
   * then keeps the loop with the largest enclosed area (the outer boundary).
   */
  private fun traceLargestBoundary(
    labels: IntArray,
    selectedLabel: Int,
    width: Int,
    height: Int
  ): List<Point> {
    val vertexWidth = width + 1
    val edges = ArrayList<GridEdge>()
    val outgoing = HashMap<Int, MutableList<Int>>()

    fun addEdge(startX: Int, startY: Int, endX: Int, endY: Int, direction: Int) {
      val edgeIndex = edges.size
      val start = startY * vertexWidth + startX
      val end = endY * vertexWidth + endX
      edges.add(GridEdge(start, end, direction))
      outgoing.getOrPut(start) { ArrayList(2) }.add(edgeIndex)
    }

    fun isSelected(x: Int, y: Int): Boolean {
      return x in 0 until width &&
        y in 0 until height &&
        labels[y * width + x] == selectedLabel
    }

    for (y in 0 until height) {
      for (x in 0 until width) {
        if (!isSelected(x, y)) {
          continue
        }

        if (!isSelected(x, y - 1)) {
          addEdge(x, y, x + 1, y, EAST)
        }
        if (!isSelected(x + 1, y)) {
          addEdge(x + 1, y, x + 1, y + 1, SOUTH)
        }
        if (!isSelected(x, y + 1)) {
          addEdge(x + 1, y + 1, x, y + 1, WEST)
        }
        if (!isSelected(x - 1, y)) {
          addEdge(x, y + 1, x, y, NORTH)
        }
      }
    }

    val used = BooleanArray(edges.size)
    var largestLoop = emptyList<Point>()
    var largestArea = 0.0

    for (firstEdgeIndex in edges.indices) {
      if (used[firstEdgeIndex]) {
        continue
      }

      val firstEdge = edges[firstEdgeIndex]
      val firstVertex = firstEdge.start
      val loop = ArrayList<Point>()
      loop.add(vertexPoint(firstVertex, vertexWidth))
      var currentEdgeIndex = firstEdgeIndex
      var closed = false
      var steps = 0

      while (steps++ <= edges.size) {
        if (used[currentEdgeIndex]) {
          break
        }

        val current = edges[currentEdgeIndex]
        used[currentEdgeIndex] = true
        loop.add(vertexPoint(current.end, vertexWidth))
        if (current.end == firstVertex) {
          closed = true
          break
        }

        val candidates = outgoing[current.end].orEmpty()
        currentEdgeIndex = chooseNextEdge(current.direction, candidates, edges, used)
        if (currentEdgeIndex < 0) {
          break
        }
      }

      if (!closed || loop.size < 4) {
        continue
      }

      // Work with unique ring vertices; closure is restored in the flat output.
      loop.removeAt(loop.lastIndex)
      val area = abs(signedArea(loop))
      if (area > largestArea) {
        largestArea = area
        largestLoop = loop
      }
    }

    return largestLoop
  }

  private fun chooseNextEdge(
    incomingDirection: Int,
    candidates: List<Int>,
    edges: List<GridEdge>,
    used: BooleanArray
  ): Int {
    var bestEdge = -1
    var bestRank = Int.MAX_VALUE

    for (candidate in candidates) {
      if (used[candidate]) {
        continue
      }
      val turn = (edges[candidate].direction - incomingDirection + 4) % 4
      val rank = when (turn) {
        1 -> 0 // right turn: keeps foreground on the right at ambiguous vertices
        0 -> 1 // straight
        3 -> 2 // left
        else -> 3 // reverse, only as a last resort
      }
      if (rank < bestRank) {
        bestRank = rank
        bestEdge = candidate
      }
    }

    return bestEdge
  }

  private fun vertexPoint(vertex: Int, vertexWidth: Int): Point {
    return Point(
      x = (vertex % vertexWidth).toDouble(),
      y = (vertex / vertexWidth).toDouble()
    )
  }

  private fun signedArea(points: List<Point>): Double {
    var twiceArea = 0.0
    for (index in points.indices) {
      val current = points[index]
      val next = points[(index + 1) % points.size]
      twiceArea += current.x * next.y - next.x * current.y
    }
    return twiceArea * 0.5
  }

  /** Simplifies a ring by applying RDP to both paths across an approximate diameter. */
  private fun simplifyClosed(points: List<Point>, tolerance: Double): List<Point> {
    if (points.size <= 4 || tolerance == 0.0) {
      return points
    }

    var firstAnchor = farthestPointIndex(points, 0)
    val secondAnchor = farthestPointIndex(points, firstAnchor)
    firstAnchor = farthestPointIndex(points, secondAnchor)

    val forward = ringPath(points, firstAnchor, secondAnchor)
    val backward = ringPath(points, secondAnchor, firstAnchor)
    val simplifiedForward = simplifyOpen(forward, tolerance)
    val simplifiedBackward = simplifyOpen(backward, tolerance)

    val result = ArrayList<Point>(simplifiedForward.size + simplifiedBackward.size - 2)
    result.addAll(simplifiedForward.dropLast(1))
    result.addAll(simplifiedBackward.dropLast(1))
    return if (result.size >= 3) result else points
  }

  private fun farthestPointIndex(points: List<Point>, originIndex: Int): Int {
    val origin = points[originIndex]
    var farthestIndex = originIndex
    var farthestDistanceSquared = -1.0

    for (index in points.indices) {
      val dx = points[index].x - origin.x
      val dy = points[index].y - origin.y
      val distanceSquared = dx * dx + dy * dy
      if (distanceSquared > farthestDistanceSquared) {
        farthestDistanceSquared = distanceSquared
        farthestIndex = index
      }
    }
    return farthestIndex
  }

  private fun ringPath(points: List<Point>, from: Int, to: Int): List<Point> {
    val path = ArrayList<Point>()
    var index = from
    path.add(points[index])
    while (index != to) {
      index = (index + 1) % points.size
      path.add(points[index])
    }
    return path
  }

  private fun simplifyOpen(points: List<Point>, tolerance: Double): List<Point> {
    if (points.size <= 2) {
      return points
    }

    val keep = BooleanArray(points.size)
    keep[0] = true
    keep[points.lastIndex] = true
    val pending = ArrayDeque<IndexRange>()
    pending.addLast(IndexRange(0, points.lastIndex))
    val toleranceSquared = tolerance * tolerance

    while (pending.isNotEmpty()) {
      val range = pending.removeLast()
      var farthestIndex = -1
      var farthestDistanceSquared = toleranceSquared

      for (index in range.start + 1 until range.end) {
        val distanceSquared = pointSegmentDistanceSquared(
          points[index],
          points[range.start],
          points[range.end]
        )
        if (distanceSquared > farthestDistanceSquared) {
          farthestDistanceSquared = distanceSquared
          farthestIndex = index
        }
      }

      if (farthestIndex >= 0) {
        keep[farthestIndex] = true
        pending.addLast(IndexRange(range.start, farthestIndex))
        pending.addLast(IndexRange(farthestIndex, range.end))
      }
    }

    return points.filterIndexed { index, _ -> keep[index] }
  }

  private fun pointSegmentDistanceSquared(point: Point, start: Point, end: Point): Double {
    val segmentX = end.x - start.x
    val segmentY = end.y - start.y
    val lengthSquared = segmentX * segmentX + segmentY * segmentY
    if (lengthSquared == 0.0) {
      val dx = point.x - start.x
      val dy = point.y - start.y
      return dx * dx + dy * dy
    }

    val projection = (
      (point.x - start.x) * segmentX +
        (point.y - start.y) * segmentY
      ) / lengthSquared
    val clampedProjection = projection.coerceIn(0.0, 1.0)
    val closestX = start.x + clampedProjection * segmentX
    val closestY = start.y + clampedProjection * segmentY
    val dx = point.x - closestX
    val dy = point.y - closestY
    return dx * dx + dy * dy
  }

  private const val EAST = 0
  private const val SOUTH = 1
  private const val WEST = 2
  private const val NORTH = 3
}
