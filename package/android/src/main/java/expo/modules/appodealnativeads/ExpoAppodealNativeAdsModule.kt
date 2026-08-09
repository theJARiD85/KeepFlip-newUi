package expo.modules.appodealnativeads

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private class AppodealNativeAdsException(
  message: String,
  cause: Throwable? = null
) : CodedException(
  "ERR_EXPO_APPODEAL_NATIVE_ADS",
  message,
  cause
)

class ExpoAppodealNativeAdsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoAppodealNativeAds")

    AsyncFunction("initialize") {
        appKey: String,
        testing: Boolean,
        cacheCount: Int,
        promise: Promise ->

      val activity = appContext.currentActivity

      if (activity == null) {
        promise.reject(
          AppodealNativeAdsException(
            "The current Android activity is unavailable."
          )
        )
        return@AsyncFunction
      }

      if (appKey.isBlank()) {
        promise.reject(
          AppodealNativeAdsException(
            "An Appodeal app key is required."
          )
        )
        return@AsyncFunction
      }

      try {
        ExpoAppodealNativeAdsCoordinator.initialize(
          activity = activity,
          appKey = appKey.trim(),
          testing = testing,
          cacheCount = cacheCount
        ) { errors ->
          promise.resolve(
            mapOf(
              "initialized" to
                ExpoAppodealNativeAdsCoordinator.isInitialized(),
              "testing" to testing,
              "availableCount" to
                ExpoAppodealNativeAdsCoordinator.availableCount(),
              "errors" to errors.orEmpty()
            )
          )
        }
      } catch (error: Throwable) {
        promise.reject(
          AppodealNativeAdsException(
            "Appodeal native ads could not initialize.",
            error
          )
        )
      }
    }

    Function("isInitialized") {
      ExpoAppodealNativeAdsCoordinator.isInitialized()
    }

    Function("getAvailableCount") {
      ExpoAppodealNativeAdsCoordinator.availableCount()
    }

    AsyncFunction("cache") { amount: Int ->
      ExpoAppodealNativeAdsCoordinator.cache(amount)
    }

    View(ExpoAppodealNativeAdView::class) {
      Prop("placement") {
          view: ExpoAppodealNativeAdView,
          placement: String ->
        view.placement = placement
      }

      Prop("active") {
          view: ExpoAppodealNativeAdView,
          active: Boolean ->
        view.active = active
      }

      Prop("refreshKey") {
          view: ExpoAppodealNativeAdView,
          refreshKey: Int ->
        view.refreshKey = refreshKey
      }

      Events(
        "onAdReady",
        "onAdFailed",
        "onAdShown",
        "onAdClicked",
        "onAdExpired"
      )

      OnViewDidUpdateProps {
          view: ExpoAppodealNativeAdView ->
        view.requestAd()
      }

      OnViewDestroys {
          view: ExpoAppodealNativeAdView ->
        view.cleanup()
      }
    }
  }
}
