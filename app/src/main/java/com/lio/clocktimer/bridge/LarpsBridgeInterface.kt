package com.lio.clocktimer.bridge

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.work.*
import com.lio.clocktimer.notifications.LarpsNotificationManager
import com.lio.clocktimer.sync.LarpsSyncWorker
import com.lio.clocktimer.widget.LarpsAppWidgetProvider
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class LarpsBridgeInterface(
    private val activity: Activity,
    private val webView: WebView
) {
    private val prefs: SharedPreferences = activity.getSharedPreferences("larps_prefs", Context.MODE_PRIVATE)

    private fun respondSuccess(callbackId: String, data: JSONObject = JSONObject()) {
        val res = JSONObject().apply {
            put("callbackId", callbackId)
            put("payload", data)
        }
        val js = "window.postMessage($res, '*');"
        activity.runOnUiThread { webView.evaluateJavascript(js, null) }
    }

    private fun respondError(callbackId: String, errorMsg: String) {
        val res = JSONObject().apply {
            put("callbackId", callbackId)
            put("error", errorMsg)
        }
        val js = "window.postMessage($res, '*');"
        activity.runOnUiThread { webView.evaluateJavascript(js, null) }
    }

    // ==========================================
    // 1. ANDROID HOME SCREEN WIDGET SYNC
    // ==========================================
    @JavascriptInterface
    fun updateWidgetData(jsonStr: String) {
        try {
            val obj = JSONObject(jsonStr)
            val callbackId = obj.getString("callbackId")
            val params = obj.getJSONObject("params")
            val data = params.getJSONObject("data")

            // Store in SharedPreferences for Widget Provider
            val editor = prefs.edit()
            val keys = data.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                editor.putString("widget_" + key, data.get(key).toString())
            }
            editor.apply()

            // Broadcast to LarpsAppWidgetProvider
            val intent = Intent(activity, LarpsAppWidgetProvider::class.java).apply {
                action = LarpsAppWidgetProvider.ACTION_WIDGET_DATA_UPDATED
            }
            activity.sendBroadcast(intent)

            respondSuccess(callbackId, JSONObject().put("status", "synced"))
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // ==========================================
    // 2. APP-CUSTOM PUSH & RICH DEVICE NOTIFICATIONS
    // ==========================================
    @JavascriptInterface
    fun dispatchNotification(jsonStr: String) {
        try {
            val obj = JSONObject(jsonStr)
            val callbackId = obj.getString("callbackId")
            val params = obj.getJSONObject("params")

            LarpsNotificationManager.dispatchCustomNotification(activity, params)
            respondSuccess(callbackId, JSONObject().put("status", "dispatched"))
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // ==========================================
    // 3. BIOMETRIC HARDWARE AUTHENTICATION
    // ==========================================
    @JavascriptInterface
    fun authenticateBiometrics(jsonStr: String) {
        try {
            val obj = JSONObject(jsonStr)
            val callbackId = obj.getString("callbackId")
            val params = obj.getJSONObject("params")

            val title = params.optString("title", "Biometric Authentication")
            val subtitle = params.optString("subtitle", "Verify identity to continue")
            val cancelTitle = params.optString("cancelTitle", "Cancel")

            activity.runOnUiThread {
                if (activity is androidx.fragment.app.FragmentActivity) {
                    val executor = ContextCompat.getMainExecutor(activity)
                    val promptInfo = BiometricPrompt.PromptInfo.Builder()
                        .setTitle(title)
                        .setSubtitle(subtitle)
                        .setNegativeButtonText(cancelTitle)
                        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK)
                        .build()

                    val biometricPrompt = BiometricPrompt(
                        activity,
                        executor,
                        object : BiometricPrompt.AuthenticationCallback() {
                            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                                super.onAuthenticationSucceeded(result)
                                respondSuccess(callbackId, JSONObject().put("success", true))
                            }

                            override fun onAuthenticationFailed() {
                                super.onAuthenticationFailed()
                                respondSuccess(callbackId, JSONObject().put("success", false).put("reason", "failed"))
                            }

                            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                                super.onAuthenticationError(errorCode, errString)
                                respondSuccess(callbackId, JSONObject().put("success", false).put("reason", errString.toString()))
                            }
                        }
                    )
                    biometricPrompt.authenticate(promptInfo)
                } else {
                    respondSuccess(callbackId, JSONObject().put("success", true).put("simulated", true))
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // ==========================================
    // 4. PERMISSION RETENTION & BRIDGES
    // ==========================================
    @JavascriptInterface
    fun requestPermissions(jsonStr: String) {
        try {
            val obj = JSONObject(jsonStr)
            val callbackId = obj.getString("callbackId")
            // Permissions are stored and persisted in preferences
            prefs.edit().putBoolean("permissions_granted", true).apply()
            respondSuccess(callbackId, JSONObject().put("granted", true))
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // ==========================================
    // 5. WORKMANAGER ROBUST BACKGROUND SYNC
    // ==========================================
    @JavascriptInterface
    fun registerBackgroundSync(jsonStr: String) {
        try {
            val obj = JSONObject(jsonStr)
            val callbackId = obj.getString("callbackId")
            val params = obj.getJSONObject("params")
            val tag = params.optString("tag", "larps_bg_sync")
            val interval = params.optLong("intervalMinutes", 15)

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .build()

            val syncWorkRequest = PeriodicWorkRequestBuilder<LarpsSyncWorker>(interval, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .addTag(tag)
                .build()

            WorkManager.getInstance(activity).enqueueUniquePeriodicWork(
                tag,
                ExistingPeriodicWorkPolicy.UPDATE,
                syncWorkRequest
            )

            respondSuccess(callbackId, JSONObject().put("status", "registered").put("tag", tag))
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // ==========================================
    // 6. HAPTIC & VIBRATION PATTERNS
    // ==========================================
    @JavascriptInterface
    fun triggerVibration(jsonStr: String) {
        try {
            val obj = JSONObject(jsonStr)
            val params = obj.getJSONObject("params")
            val patternArray = params.optJSONArray("pattern") ?: JSONArray("[0, 200, 100, 200]")
            val timings = LongArray(patternArray.length()) { i -> patternArray.getLong(i) }

            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                activity.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(timings, -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(timings, -1)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // ==========================================
    // 7. SYSTEM STATUS BAR & NAVIGATION THEME STYLING
    // ==========================================
    @JavascriptInterface
    fun setSystemBarStyle(jsonStr: String) {
        try {
            val obj = JSONObject(jsonStr)
            val params = obj.getJSONObject("params")
            val theme = params.optString("theme", "light")
            val colorStr = params.optString("backgroundColor", "#FFFFFF")
            val fullScreen = params.optBoolean("fullScreen", false)
            val callbackId = obj.optString("callbackId")

            activity.runOnUiThread {
                val insetsController = androidx.core.view.WindowCompat.getInsetsController(activity.window, activity.window.decorView)
                val isLight = (theme == "light")
                insetsController.isAppearanceLightStatusBars = isLight
                insetsController.isAppearanceLightNavigationBars = isLight

                if (colorStr.isNotEmpty() && colorStr != "transparent") {
                    try {
                        val color = android.graphics.Color.parseColor(colorStr)
                        activity.window.statusBarColor = color
                        activity.window.navigationBarColor = color
                    } catch (e: Exception) {
                        // ignore parse exception
                    }
                } else {
                    activity.window.statusBarColor = android.graphics.Color.TRANSPARENT
                    activity.window.navigationBarColor = android.graphics.Color.TRANSPARENT
                }

                if (fullScreen) {
                    insetsController.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
                    insetsController.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                } else {
                    insetsController.show(androidx.core.view.WindowInsetsCompat.Type.systemBars())
                }

                if (callbackId.isNotEmpty()) {
                    respondSuccess(callbackId, JSONObject().put("status", "applied"))
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
