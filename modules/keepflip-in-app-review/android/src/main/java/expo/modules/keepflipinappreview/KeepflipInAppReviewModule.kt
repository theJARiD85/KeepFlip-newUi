package expo.modules.keepflipinappreview

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import com.google.android.play.core.review.ReviewManagerFactory
import android.app.Activity

class KeepflipInAppReviewModule : Module() {
  
  private val currentActivity: Activity?
    get() = appContext.currentActivity

  override fun definition() = ModuleDefinition {
    Name("KeepflipInAppReview")

    AsyncFunction("requestReview") { promise: Promise ->
      val activity = currentActivity
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "Android current activity is not available", null)
        return@AsyncFunction
      }

      val manager = ReviewManagerFactory.create(activity)
      val request = manager.requestReviewFlow()
      
      request.addOnCompleteListener { task ->
        if (task.isSuccessful) {
          val reviewInfo = task.result
          val flow = manager.launchReviewFlow(activity, reviewInfo)
          flow.addOnCompleteListener { _ ->
            promise.resolve(true)
          }
        } else {
          val exception = task.exception
          promise.reject(
            "REVIEW_FLOW_FAILED", 
            exception?.message ?: "Failed to request Play Store review flow token", 
            exception
          )
        }
      }
    }
  }
}
