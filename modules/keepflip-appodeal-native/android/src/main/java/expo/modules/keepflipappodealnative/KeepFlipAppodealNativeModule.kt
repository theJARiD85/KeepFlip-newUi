package expo.modules.keepflipappodealnative

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private class AppodealNativeException(message: String, cause: Throwable? = null) :
  CodedException("ERR_KEEPFLIP_APPODEAL_NATIVE", message, cause)

class KeepFlipAppodealNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KeepFlipAppodealNative")

    AsyncFunction("initialize") { appKey: String, testing: Boolean, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(AppodealNativeException("The current Android activity is unavailable."))
        return@AsyncFunction
      }

      if (appKey.isBlank()) {
        promise.reject(AppodealNativeException("An Appodeal app key is required."))
        return@AsyncFunction
      }

      try {
        KeepFlipAppodealNativeCoordinator.initialize(
          activity = activity,
          appKey = appKey.trim(),
          testing = testing
        ) { errors ->
          promise.resolve(
            mapOf(
              "initialized" to KeepFlipAppodealNativeCoordinator.isInitialized(),
              "testing" to testing,
              "errors" to errors.orEmpty()
            )
          )
        }
      } catch (error: Throwable) {
        promise.reject(AppodealNativeException("Appodeal native ads could not initialize.", error))
      }
    }

    Function("isInitialized") {
      KeepFlipAppodealNativeCoordinator.isInitialized()
    }

    AsyncFunction("cache") { amount: Int ->
      KeepFlipAppodealNativeCoordinator.cache(amount)
      true
    }

    View(KeepFlipAppodealNativeView::class) {
      Prop("placement") { view: KeepFlipAppodealNativeView, placement: String ->
        view.placement = placement
      }

      Events(
        "onAdReady",
        "onAdFailed",
        "onAdShown",
        "onAdClicked",
        "onAdExpired"
      )

      OnViewDidUpdateProps { view: KeepFlipAppodealNativeView ->
        view.requestAd()
      }

      OnViewDestroys { view: KeepFlipAppodealNativeView ->
        view.cleanup()
      }
    }
  }
}
