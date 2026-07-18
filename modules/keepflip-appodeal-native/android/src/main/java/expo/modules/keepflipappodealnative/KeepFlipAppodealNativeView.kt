package expo.modules.keepflipappodealnative

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.widget.FrameLayout
import com.appodeal.ads.NativeAd
import com.appodeal.ads.nativead.NativeAdView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class KeepFlipAppodealNativeView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext) {
  private val onAdReady by EventDispatcher()
  private val onAdFailed by EventDispatcher()
  private val onAdShown by EventDispatcher()
  private val onAdClicked by EventDispatcher()
  private val onAdExpired by EventDispatcher()

  private val nativeAdView = LayoutInflater.from(context)
    .inflate(R.layout.keepflip_native_ad, this, false) as NativeAdView

  private var currentAd: NativeAd? = null
  private var destroyed = false

  var placement: String = "default"
    set(value) {
      val normalized = value.trim().ifEmpty { "default" }
      if (field == normalized) return
      field = normalized
      if (isAttachedToWindow && currentAd != null) {
        registerCurrentAd(emitReady = false)
      }
    }

  init {
    addView(
      nativeAdView,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.WRAP_CONTENT
      )
    )
    KeepFlipAppodealNativeCoordinator.attach(this)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (destroyed) return
    KeepFlipAppodealNativeCoordinator.attach(this)

    if (currentAd == null) {
      requestAd()
    } else {
      registerCurrentAd(emitReady = false)
    }
  }

  override fun onDetachedFromWindow() {
    if (!destroyed && currentAd != null) {
      nativeAdView.unregisterView()
    }
    KeepFlipAppodealNativeCoordinator.detach(this)
    super.onDetachedFromWindow()
  }

  fun requestAd() {
    if (!destroyed && isAttachedToWindow && currentAd == null) {
      KeepFlipAppodealNativeCoordinator.requestAd(this)
    }
  }

  internal fun canAcceptAd(): Boolean =
    !destroyed && isAttachedToWindow && currentAd == null

  internal fun hasAd(nativeAd: NativeAd): Boolean =
    currentAd === nativeAd || currentAd == nativeAd

  internal fun bind(nativeAd: NativeAd) {
    if (!canAcceptAd()) return
    currentAd = nativeAd
    registerCurrentAd(emitReady = true)
  }

  private fun registerCurrentAd(emitReady: Boolean) {
    val nativeAd = currentAd ?: return
    nativeAdView.unregisterView()

    val registered = if (placement == "default") {
      nativeAdView.registerView(nativeAd)
    } else {
      nativeAdView.registerView(nativeAd, placement)
    }

    if (!registered) {
      currentAd = null
      nativeAdView.visibility = View.GONE
      notifyLoadFailed("native_register_failed")
      KeepFlipAppodealNativeCoordinator.cache(2)
      return
    }

    if (emitReady) {
      onAdReady(
        mapOf(
          "placement" to placement,
          "availableCount" to com.appodeal.ads.Appodeal.getAvailableNativeAdsCount()
        )
      )
    }
  }

  internal fun notifyLoadFailed(code: String) {
    onAdFailed(mapOf("code" to code, "placement" to placement))
  }

  internal fun notifyShown() {
    onAdShown(mapOf("placement" to placement))
  }

  internal fun notifyShowFailed() {
    nativeAdView.unregisterView()
    nativeAdView.visibility = View.GONE
    currentAd = null
    notifyLoadFailed("native_show_failed")
    requestAd()
  }

  internal fun notifyClicked() {
    onAdClicked(mapOf("placement" to placement))
  }

  internal fun notifyExpired() {
    onAdExpired(mapOf("placement" to placement))
    if (currentAd == null) requestAd()
  }

  fun cleanup() {
    if (destroyed) return
    destroyed = true
    KeepFlipAppodealNativeCoordinator.detach(this)
    currentAd = null
    nativeAdView.destroy()
  }
}
