package expo.modules.keepflipappodealnative

import android.app.Activity
import com.appodeal.ads.Appodeal
import com.appodeal.ads.NativeAd
import com.appodeal.ads.NativeCallbacks
import java.lang.ref.WeakReference
import java.util.Collections
import java.util.WeakHashMap

internal object KeepFlipAppodealNativeCoordinator : NativeCallbacks {
  private val views = Collections.newSetFromMap(
    WeakHashMap<KeepFlipAppodealNativeView, Boolean>()
  )
  private val initializationCallbacks = mutableListOf<(List<String>?) -> Unit>()

  private var activityReference: WeakReference<Activity>? = null
  private var initializationInProgress = false

  @Synchronized
  fun initialize(
    activity: Activity,
    appKey: String,
    testing: Boolean,
    callback: (List<String>?) -> Unit
  ) {
    activityReference = WeakReference(activity)
    Appodeal.setNativeCallbacks(this)

    if (Appodeal.isInitialized(Appodeal.NATIVE)) {
      callback(null)
      cache(2)
      dispatchAvailableAds()
      return
    }

    initializationCallbacks.add(callback)
    if (initializationInProgress) return

    initializationInProgress = true
    Appodeal.setTesting(testing)

    Appodeal.initialize(activity, appKey, Appodeal.NATIVE) { errors ->
      val messages = errors
        ?.map { error -> error.toString() }
        ?.filter { message -> message.isNotBlank() }
        .orEmpty()

      val callbacks = synchronized(this) {
        initializationInProgress = false
        initializationCallbacks.toList().also { initializationCallbacks.clear() }
      }

      callbacks.forEach { pendingCallback ->
        pendingCallback(messages.ifEmpty { null })
      }

      if (Appodeal.isInitialized(Appodeal.NATIVE)) {
        cache(2)
        dispatchAvailableAds()
      }
    }
  }

  fun isInitialized(): Boolean = Appodeal.isInitialized(Appodeal.NATIVE)

  @Synchronized
  fun attach(view: KeepFlipAppodealNativeView) {
    views.add(view)
  }

  @Synchronized
  fun detach(view: KeepFlipAppodealNativeView) {
    views.remove(view)
  }

  fun requestAd(view: KeepFlipAppodealNativeView) {
    if (!view.canAcceptAd() || !isInitialized()) return

    val nativeAd = synchronized(this) {
      if (Appodeal.isLoaded(Appodeal.NATIVE)) {
        Appodeal.getNativeAds(1).firstOrNull()
      } else {
        null
      }
    }

    if (nativeAd == null) {
      cache(2)
      return
    }

    view.bind(nativeAd)
    cache(2)
  }

  fun cache(amount: Int = 2) {
    val activity = activityReference?.get() ?: return
    if (!isInitialized()) return
    Appodeal.cache(activity, Appodeal.NATIVE, amount.coerceIn(1, 5))
  }

  private fun snapshotViews(): List<KeepFlipAppodealNativeView> = synchronized(this) {
    views.toList()
  }

  private fun dispatchAvailableAds() {
    snapshotViews().forEach { view -> requestAd(view) }
  }

  override fun onNativeLoaded() {
    dispatchAvailableAds()
  }

  override fun onNativeFailedToLoad() {
    snapshotViews()
      .filter { view -> view.canAcceptAd() }
      .forEach { view -> view.notifyLoadFailed("native_load_failed") }
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
    snapshotViews().forEach { view -> view.notifyExpired() }
  }
}
