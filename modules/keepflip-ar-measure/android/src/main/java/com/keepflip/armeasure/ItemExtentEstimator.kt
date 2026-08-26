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

    val edges =
      intArrayOf(
        0, 1,
        1, 3,
        3, 2,
        2, 0,
        4, 5,
        5, 7,
        7, 6,
        6, 4,
        0, 4,
        1, 5,
        2, 6,
        3, 7
      )

    val lineVertices =
      FloatArray(edges.size * 3)

    var outputIndex = 0

    edges.forEach { cornerIndex ->
      val corner = corners[cornerIndex]

      lineVertices[outputIndex++] = corner[0]
      lineVertices[outputIndex++] = corner[1]
      lineVertices[outputIndex++] = corner[2]
    }

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
