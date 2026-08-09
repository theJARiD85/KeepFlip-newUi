package expo.modules.appodealnativeads

import android.app.Activity
import com.appodeal.ads.Appodeal
import com.appodeal.ads.NativeAd
import com.appodeal.ads.NativeCallbacks
import com.appodeal.ads.utils.Log
import java.lang.ref.WeakReference
import java.util.Collections
import java.util.WeakHashMap

internal object ExpoAppodealNativeAdsCoordinator : NativeCallbacks {
  private val views = Collections.newSetFromMap(
    WeakHashMap<ExpoAppodealNativeAdView, Boolean>()
  )

  private val initializationCallbacks =
    mutableListOf<(List<String>?) -> Unit>()

  private var activityReference: WeakReference<Activity>? = null
  private var initializationInProgress = false
  private var defaultCacheCount = 2

  @Synchronized
  fun initialize(
    activity: Activity,
    appKey: String,
    testing: Boolean,
    cacheCount: Int,
    callback: (List<String>?) -> Unit
  ) {
    activityReference = WeakReference(activity)
    defaultCacheCount = cacheCount.coerceIn(1, 5)

    Appodeal.setNativeCallbacks(this)

    if (Appodeal.isInitialized(Appodeal.NATIVE or Appodeal.MREC)) {
      callback(null)
      cache(defaultCacheCount)
      dispatchAvailableAds()
      return
    }

    initializationCallbacks.add(callback)
    if (initializationInProgress) {
      return
    }

    initializationInProgress = true

    if (testing) {
      Appodeal.setLogLevel(Log.LogLevel.verbose)
    }
    Appodeal.setTesting(testing)
    Appodeal.setAutoCache(Appodeal.NATIVE or Appodeal.MREC, true)

    Appodeal.initialize(
      activity,
      appKey,
      Appodeal.MREC or
      Appodeal.NATIVE
    ) { errors ->
      val messages = errors
        ?.map { error -> error.toString() }
        ?.filter { message -> message.isNotBlank() }
        .orEmpty()

      val callbacks = synchronized(this) {
        initializationInProgress = false
        initializationCallbacks
          .toList()
          .also { initializationCallbacks.clear() }
      }

      callbacks.forEach { pendingCallback ->
        pendingCallback(
          messages.ifEmpty { null }
        )
      }

      if (Appodeal.isInitialized(Appodeal.NATIVE or Appodeal.MREC)) {
        cache(defaultCacheCount)
        dispatchAvailableAds()
      }
    }
  }

  fun isInitialized(): Boolean =
    Appodeal.isInitialized(Appodeal.NATIVE or Appodeal.MREC)

  fun availableCount(): Int =
    Appodeal.getAvailableNativeAdsCount()

  @Synchronized
  fun attach(view: ExpoAppodealNativeAdView) {
    views.add(view)
  }

  @Synchronized
  fun detach(view: ExpoAppodealNativeAdView) {
    views.remove(view)
  }

  fun requestAd(view: ExpoAppodealNativeAdView) {
    if (!view.canAcceptAd() || !isInitialized()) {
      return
    }

    val nativeAd = synchronized(this) {
      if (Appodeal.getAvailableNativeAdsCount() > 0) {
        Appodeal.getNativeAds(1).firstOrNull()
      } else {
        null
      }
    }

    if (nativeAd == null) {
      cache(defaultCacheCount)
      return
    }

    view.bind(nativeAd)
    cache(defaultCacheCount)
  }

  fun cache(amount: Int = defaultCacheCount): Boolean {
    val activity = activityReference?.get() ?: return false
    if (!isInitialized()) {
      return false
    }

    Appodeal.cache(
      activity,
      Appodeal.NATIVE or
      Appodeal.MREC,
      amount.coerceIn(1, 5)
    )

    return true
  }

  private fun snapshotViews(): List<ExpoAppodealNativeAdView> =
    synchronized(this) {
      views.toList()
    }

  private fun dispatchAvailableAds() {
    snapshotViews().forEach { view ->
      requestAd(view)
    }
  }

  override fun onNativeLoaded() {
    dispatchAvailableAds()
  }

  override fun onNativeFailedToLoad() {
    snapshotViews()
      .filter { view -> view.canAcceptAd() }
      .forEach { view ->
        view.notifyLoadFailed("native_load_failed")
      }
  }

  override fun onNativeShown(nativeAd: NativeAd?) {
    nativeAd ?: return

    snapshotViews()
      .filter { view -> view.hasAd(nativeAd) }
      .forEach { view -> view.notifyShown() }
  }

  override fun onNativeShowFailed(nativeAd: NativeAd?) {
    nativeAd ?: return

    snapshotViews()
      .filter { view -> view.hasAd(nativeAd) }
      .forEach { view -> view.notifyShowFailed() }
  }

  override fun onNativeClicked(nativeAd: NativeAd?) {
    nativeAd ?: return

    snapshotViews()
      .filter { view -> view.hasAd(nativeAd) }
      .forEach { view -> view.notifyClicked() }
  }

  override fun onNativeExpired() {
    snapshotViews().forEach { view ->
      view.notifyExpired()
    }
  }
}
