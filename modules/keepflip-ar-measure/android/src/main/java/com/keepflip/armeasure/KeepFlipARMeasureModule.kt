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
        "onBiRefNetTapFrame",
        "onError"
      )
      Prop("measurementMode") { view: KeepFlipARMeasureView, mode: String? ->
        view.setMeasurementMode(mode)
      }

      Prop("biRefNetTapValidation") { view: KeepFlipARMeasureView, enabled: Boolean? ->
        view.setBiRefNetTapValidation(enabled)
      }

      Prop("tapMaskDecision") { view: KeepFlipARMeasureView, decision: String? ->
        view.setTapMaskDecision(decision)
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
