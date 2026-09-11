package com.keepflip.armeasure

import com.google.ar.core.ArCoreApk
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KeepFlipARMeasureModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KeepFlipARMeasure")

    AsyncFunction("isSupported") {
      val activity = appContext.currentActivity
        ?: return@AsyncFunction false

      val availability =
        ArCoreApk.getInstance().checkAvailability(activity)

      return@AsyncFunction availability.isSupported
    }

    View(KeepFlipARMeasureView::class) {
      Events(
        "onTrackingState",
        "onTargetState",
        "onDetectedCorner",
        "onPointPlaced",
        "onMeasurement",
        "onMeasurementGeometry",
        "onBoxMeasurement",
        "onItemMeasurement",
        "onError"
      )
      Prop("measurementMode") { view: KeepFlipARMeasureView, mode: String? ->
        view.setMeasurementMode(mode)
      }

      AsyncFunction("resetMeasurement") {
        view: KeepFlipARMeasureView ->
        view.resetMeasurement()
      }

      OnViewDestroys {
        view: KeepFlipARMeasureView ->
        view.dispose()
      }
    }
  }
}