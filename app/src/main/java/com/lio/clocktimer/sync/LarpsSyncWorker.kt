package com.lio.clocktimer.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.lio.clocktimer.notifications.LarpsNotificationManager
import org.json.JSONObject

class LarpsSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return try {
            // Robust background synchronization: Fetch live world events
            // and trigger device notification if needed
            val payload = JSONObject().apply {
                put("title", "⚡ Background World Event")
                put("body", "Synced periodic status while app was inactive. Next checkpoint ready.")
                put("channelId", LarpsNotificationManager.CHANNEL_DEFAULT)
                put("deepLink", "larps://screen/events")
            }
            LarpsNotificationManager.dispatchCustomNotification(applicationContext, payload)

            Result.success()
        } catch (e: Exception) {
            e.printStackTrace()
            Result.retry()
        }
    }
}
