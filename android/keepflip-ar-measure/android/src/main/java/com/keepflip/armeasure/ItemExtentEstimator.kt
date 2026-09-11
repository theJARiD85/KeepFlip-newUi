package com.keepflip.armeasure

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Estimates an oriented bounding box from world-space object samples.
 *
 * The estimator intentionally knows nothing about boxes, corners, or ARCore.
 * It only receives fused 3D points. This keeps arbitrary-item measurement
 * separate from the legacy cuboid/corner specialist and makes the geometry
 * deterministic enough to unit-test without a camera.
 */
internal data class ItemExtentEstimate(
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
  val heightEdgeEnd: FloatArray,
  val centerWorld: FloatArray,
  val axes: Array<FloatArray>,
  val sampleCount: Int
)

internal object ItemExtentEstimator {
  private const val MINIMUM_POINTS = 12
  private const val MINIMUM_EXTENT_METERS = 0.025f
  private const val MAXIMUM_EXTENT_METERS = 3.0f
  private const val POWER_ITERATIONS = 24

  fun estimate(
    inputPoints: List<FloatArray>
  ): ItemExtentEstimate? {
    val points =
      inputPoints.filter { point ->
        point.size >= 3 &&
          point[0].isFinite() &&
          point[1].isFinite() &&
          point[2].isFinite()
      }

    if (points.size < MINIMUM_POINTS) {
      return null
    }

    val centroid =
      floatArrayOf(
        points.sumOf { it[0].toDouble() }.toFloat() / points.size,
        points.sumOf { it[1].toDouble() }.toFloat() / points.size,
        points.sumOf { it[2].toDouble() }.toFloat() / points.size
      )

    val covariance = covariance(points, centroid)

    val firstAxis =
      dominantAxis(
        covariance,
        floatArrayOf(1f, 0f, 0f)
      )

    val secondAxis =
      dominantAxis(
        covariance,
        floatArrayOf(0f, 1f, 0f),
        arrayOf(firstAxis)
      )

    val thirdAxis =
      normalize(
        cross(
          firstAxis,
          secondAxis
        )
      )

    if (
      vectorLength(firstAxis) < 0.0001f ||
      vectorLength(secondAxis) < 0.0001f ||
      vectorLength(thirdAxis) < 0.0001f
    ) {
      return null
    }

    val rawAxes =
      arrayOf(
        firstAxis,
        secondAxis,
        thirdAxis
      )

    val rawRanges =
      rawAxes.map { axis ->
        val projections =
          points
            .map { point ->
              dot(
                subtract(point, centroid),
                axis
              )
            }
            .sorted()

        val trim =
          if (projections.size >= 50) {
            0.02f
          } else {
            0f
          }

        val low =
          percentile(
            projections,
            trim
          )

        val high =
          percentile(
            projections,
            1f - trim
          )

        AxisRange(
          axis = axis,
          low = low,
          high = high,
          extent = high - low
        )
      }

    val ranges =
      rawRanges.sortedByDescending { it.extent }

    if (
      ranges.any { range ->
        range.extent < MINIMUM_EXTENT_METERS ||
          range.extent > MAXIMUM_EXTENT_METERS
      }
    ) {
      return null
    }

    val axes =
      ranges.map { range ->
        range.axis
      }.toTypedArray()

    val centerWorld =
      centroid.copyOf()

    ranges.forEachIndexed { index, range ->
      centerWorld[0] +=
        axes[index][0] *
          ((range.low + range.high) / 2f)
      centerWorld[1] +=
        axes[index][1] *
          ((range.low + range.high) / 2f)
      centerWorld[2] +=
        axes[index][2] *
          ((range.low + range.high) / 2f)
    }

    val extents =
      ranges.map { range ->
        range.extent
      }

    val corners =
      buildCorners(
        centerWorld,
        axes,
        extents
      )

    val lineVertices =
      buildWireframeVertices(
        points,
        centroid,
        axes,
        ranges
      )

    return ItemExtentEstimate(
      corners = corners,
      lineVertices = lineVertices,
      lengthMeters = extents[0],
      widthMeters = extents[1],
      heightMeters = extents[2],
      lengthEdgeStart = corners[0],
      lengthEdgeEnd = corners[1],
      widthEdgeStart = corners[0],
      widthEdgeEnd = corners[2],
      heightEdgeStart = corners[0],
      heightEdgeEnd = corners[4],
      centerWorld = centerWorld,
      axes = axes,
      sampleCount = points.size
    )
  }

  private data class AxisRange(
    val axis: FloatArray,
    val low: Float,
    val high: Float,
    val extent: Float
  )

  private fun covariance(
    points: List<FloatArray>,
    centroid: FloatArray
  ): FloatArray {
    val result =
      FloatArray(9)

    points.forEach { point ->
      val x = point[0] - centroid[0]
      val y = point[1] - centroid[1]
      val z = point[2] - centroid[2]

      result[0] += x * x
      result[1] += x * y
      result[2] += x * z
      result[3] += y * x
      result[4] += y * y
      result[5] += y * z
      result[6] += z * x
      result[7] += z * y
      result[8] += z * z
    }

    val divisor =
      points.size.toFloat()

    return result.map { value ->
      value / divisor
    }.toFloatArray()
  }

  private fun dominantAxis(
    covariance: FloatArray,
    initial: FloatArray,
    orthogonalAxes: Array<FloatArray> = emptyArray()
  ): FloatArray {
    var axis =
      normalize(initial)

    repeat(POWER_ITERATIONS) {
      var next =
        multiply(
          covariance,
          axis
        )

      orthogonalAxes.forEach { other ->
        next =
          subtract(
            next,
            scale(
              other,
              dot(next, other)
            )
          )
      }

      val nextLength =
        vectorLength(next)

      if (nextLength < 0.000001f) {
        return axis
      }

      axis =
        scale(
          next,
          1f / nextLength
        )
    }

    return axis
  }

  private fun percentile(
    sortedValues: List<Float>,
    fraction: Float
  ): Float {
    if (sortedValues.isEmpty()) {
      return 0f
    }

    val position =
      fraction.coerceIn(0f, 1f) *
        (sortedValues.size - 1)

    val lowerIndex =
      position.toInt()

    val upperIndex =
      min(
        lowerIndex + 1,
        sortedValues.lastIndex
      )

    val interpolation =
      position - lowerIndex

    return sortedValues[lowerIndex] +
      (
        sortedValues[upperIndex] -
          sortedValues[lowerIndex]
        ) * interpolation
  }

  private fun buildCorners(
    center: FloatArray,
    axes: Array<FloatArray>,
    extents: List<Float>
  ): Array<FloatArray> {
    val halfLength = extents[0] / 2f
    val halfWidth = extents[1] / 2f
    val halfHeight = extents[2] / 2f

    fun corner(
      lengthSign: Float,
      widthSign: Float,
      heightSign: Float
    ): FloatArray {
      return add(
        add(
          add(
            center,
            scale(
              axes[0],
              lengthSign * halfLength
            )
          ),
          scale(
            axes[1],
            widthSign * halfWidth
          )
        ),
        scale(
          axes[2],
          heightSign * halfHeight
        )
      )
    }

    return arrayOf(
      corner(-1f, -1f, -1f),
      corner(1f, -1f, -1f),
      corner(-1f, 1f, -1f),
      corner(1f, 1f, -1f),
      corner(-1f, -1f, 1f),
      corner(1f, -1f, 1f),
      corner(-1f, 1f, 1f),
      corner(1f, 1f, 1f)
    )
  }

  private fun multiply(
    matrix: FloatArray,
    vector: FloatArray
  ): FloatArray {
    return floatArrayOf(
      matrix[0] * vector[0] +
        matrix[1] * vector[1] +
        matrix[2] * vector[2],
      matrix[3] * vector[0] +
        matrix[4] * vector[1] +
        matrix[5] * vector[2],
      matrix[6] * vector[0] +
        matrix[7] * vector[1] +
        matrix[8] * vector[2]
    )
  }
  /** Build a bounded world-space wireframe from the fused depth samples. */
  private fun buildWireframeVertices(
    points: List<FloatArray>,
    centroid: FloatArray,
    axes: Array<FloatArray>,
    ranges: List<AxisRange>
  ): FloatArray {
    val gridSize = 8
    val maxSegments = 260
    if (points.isEmpty() || axes.size < 3 || ranges.size < 3) {
      return FloatArray(0)
    }

    val occupied = mutableSetOf<Int>()
    points.forEach { point ->
      val projections = axes.map { axis ->
        dot(subtract(point, centroid), axis)
      }
      occupied.add(
        wireframeCellKey(
          projectionToCell(projections[0], ranges[0], gridSize),
          projectionToCell(projections[1], ranges[1], gridSize),
          projectionToCell(projections[2], ranges[2], gridSize),
          gridSize
        )
      )
    }

    if (occupied.isEmpty()) {
      return FloatArray(0)
    }

    val vertices = ArrayList<Float>(maxSegments * 6)
    fun addSegment(first: FloatArray, second: FloatArray) {
      if (vertices.size / 6 >= maxSegments) return
      vertices.add(first[0])
      vertices.add(first[1])
      vertices.add(first[2])
      vertices.add(second[0])
      vertices.add(second[1])
      vertices.add(second[2])
    }

    /* Keep a clean outer outline even when the depth samples are sparse. */
    val hull = buildProjectedHull(points, centroid, axes[0], axes[1])
    if (hull.size >= 2) {
      hull.indices.forEach { index ->
        addSegment(hull[index], hull[(index + 1) % hull.size])
      }
    }

    val boundaryCells = occupied.filter { key ->
      val cell = decodeWireframeCell(key, gridSize)
      isBoundaryCell(cell[0], cell[1], cell[2], occupied, gridSize)
    }.toSet()

    occupied.forEach { key ->
      if (vertices.size / 6 >= maxSegments) return@forEach
      val cell = decodeWireframeCell(key, gridSize)
      val first = wireframeCellCenter(
        cell[0], cell[1], cell[2], centroid, axes, ranges, gridSize
      )
      val neighbors = arrayOf(
        intArrayOf(cell[0] + 1, cell[1], cell[2]),
        intArrayOf(cell[0], cell[1] + 1, cell[2]),
        intArrayOf(cell[0], cell[1], cell[2] + 1)
      )
      neighbors.forEach { neighbor ->
        if (neighbor.any { coordinate -> coordinate !in 0 until gridSize }) {
          return@forEach
        }
        val neighborKey = wireframeCellKey(
          neighbor[0], neighbor[1], neighbor[2], gridSize
        )
        if (
          !occupied.contains(neighborKey) ||
          (!boundaryCells.contains(key) && !boundaryCells.contains(neighborKey))
        ) {
          return@forEach
        }
        addSegment(
          first,
          wireframeCellCenter(
            neighbor[0], neighbor[1], neighbor[2],
            centroid, axes, ranges, gridSize
          )
        )
      }
    }

    return vertices.toFloatArray()
  }

  private fun projectionToCell(
    projection: Float,
    range: AxisRange,
    gridSize: Int
  ): Int {
    if (range.extent <= 0f) return 0
    return (((projection - range.low) / range.extent) * gridSize)
      .toInt().coerceIn(0, gridSize - 1)
  }

  private fun wireframeCellKey(x: Int, y: Int, z: Int, gridSize: Int): Int {
    return x + gridSize * (y + gridSize * z)
  }

  private fun decodeWireframeCell(key: Int, gridSize: Int): IntArray {
    val z = key / (gridSize * gridSize)
    val remainder = key - z * gridSize * gridSize
    val y = remainder / gridSize
    return intArrayOf(remainder - y * gridSize, y, z)
  }

  private fun isBoundaryCell(
    x: Int,
    y: Int,
    z: Int,
    occupied: Set<Int>,
    gridSize: Int
  ): Boolean {
    val neighbors = arrayOf(
      intArrayOf(x - 1, y, z), intArrayOf(x + 1, y, z),
      intArrayOf(x, y - 1, z), intArrayOf(x, y + 1, z),
      intArrayOf(x, y, z - 1), intArrayOf(x, y, z + 1)
    )
    return neighbors.any { neighbor ->
      neighbor.any { coordinate -> coordinate !in 0 until gridSize } ||
        !occupied.contains(
          wireframeCellKey(neighbor[0], neighbor[1], neighbor[2], gridSize)
        )
    }
  }

  private fun wireframeCellCenter(
    x: Int,
    y: Int,
    z: Int,
    centroid: FloatArray,
    axes: Array<FloatArray>,
    ranges: List<AxisRange>,
    gridSize: Int
  ): FloatArray {
    var point = centroid.copyOf()
    val cells = intArrayOf(x, y, z)
    for (axisIndex in 0..2) {
      val fraction = (cells[axisIndex] + 0.5f) / gridSize.toFloat()
      val projection = ranges[axisIndex].low + ranges[axisIndex].extent * fraction
      point = add(point, scale(axes[axisIndex], projection))
    }
    return point
  }

  private data class ProjectedPoint(
    val x: Float,
    val y: Float,
    val world: FloatArray
  )

  private fun buildProjectedHull(
    points: List<FloatArray>,
    centroid: FloatArray,
    firstAxis: FloatArray,
    secondAxis: FloatArray
  ): List<FloatArray> {
    val projected = points.map { point ->
      ProjectedPoint(
        dot(subtract(point, centroid), firstAxis),
        dot(subtract(point, centroid), secondAxis),
        point
      )
    }.sortedWith(compareBy<ProjectedPoint> { it.x }.thenBy { it.y })

    if (projected.size < 3) return projected.map { it.world }

    fun cross(origin: ProjectedPoint, first: ProjectedPoint, second: ProjectedPoint): Float {
      return (first.x - origin.x) * (second.y - origin.y) -
        (first.y - origin.y) * (second.x - origin.x)
    }

    fun buildHalf(input: List<ProjectedPoint>): MutableList<ProjectedPoint> {
      val half = mutableListOf<ProjectedPoint>()
      input.forEach { point ->
        while (
          half.size >= 2 &&
          cross(half[half.lastIndex - 1], half.last(), point) <= 0f
        ) {
          half.removeAt(half.lastIndex)
        }
        half.add(point)
      }
      return half
    }

    val lower = buildHalf(projected)
    val upper = buildHalf(projected.asReversed())
    val hull = (lower.dropLast(1) + upper.dropLast(1)).map { it.world }
    return if (hull.size >= 2) hull else projected.map { it.world }
  }

  private fun cross(
    first: FloatArray,
    second: FloatArray
  ): FloatArray {
    return floatArrayOf(
      first[1] * second[2] -
        first[2] * second[1],
      first[2] * second[0] -
        first[0] * second[2],
      first[0] * second[1] -
        first[1] * second[0]
    )
  }

  private fun add(
    first: FloatArray,
    second: FloatArray
  ): FloatArray {
    return floatArrayOf(
      first[0] + second[0],
      first[1] + second[1],
      first[2] + second[2]
    )
  }

  private fun subtract(
    first: FloatArray,
    second: FloatArray
  ): FloatArray {
    return floatArrayOf(
      first[0] - second[0],
      first[1] - second[1],
      first[2] - second[2]
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
      vectorLength(vector)

    if (length < 0.000001f) {
      return floatArrayOf(0f, 0f, 0f)
    }

    return scale(
      vector,
      1f / length
    )
  }

  private fun dot(
    first: FloatArray,
    second: FloatArray
  ): Float {
    return first[0] * second[0] +
      first[1] * second[1] +
      first[2] * second[2]
  }

  private fun vectorLength(
    vector: FloatArray
  ): Float {
    return sqrt(
      max(
        0f,
        dot(vector, vector)
      )
    )
  }
}
