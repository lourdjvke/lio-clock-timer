package com.lio.clocktimer.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.lio.clocktimer.MainActivity
import com.lio.clocktimer.R
import org.json.JSONObject
import java.net.URL

object LarpsNotificationManager {

    const val CHANNEL_URGENT = "larps_combat_urgent"
    const val CHANNEL_DEFAULT = "larps_events"
    const val CHANNEL_BACKGROUND = "larps_bg_sync"

    fun createDefaultNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val audioAttr = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build()

            // 1. High priority channel with vibration rhythm
            val urgentChannel = NotificationChannel(
                CHANNEL_URGENT,
                "LARPs Urgent Combat & Live Events",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Live roleplay combat alerts and high-stakes in-game alarms"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 100, 250, 100, 450)
                enableLights(true)
                lightColor = 0xFF00E5FF.toInt()
            }

            // 2. Default events channel
            val defaultChannel = NotificationChannel(
                CHANNEL_DEFAULT,
                "LARPs World Notifications",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Standard roleplay updates and companion messages"
            }

            nm.createNotificationChannel(urgentChannel)
            nm.createNotificationChannel(defaultChannel)
        }
    }

    fun dispatchCustomNotification(context: Context, payload: JSONObject) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val notifId = (System.currentTimeMillis() % 100000).toInt()
        val title = payload.optString("title", "LARPs Notification")
        val body = payload.optString("body", "")
        val channelId = payload.optString("channelId", CHANNEL_DEFAULT)
        val deepLink = payload.optString("deepLink", "larps://screen/home")

        val launchIntent = Intent(context, MainActivity::class.java).apply {
            data = Uri.parse(deepLink)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            context,
            notifId,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(contentPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        // Custom vibration pattern
        if (payload.has("vibrationPattern")) {
            val vArray = payload.getJSONArray("vibrationPattern")
            val pattern = LongArray(vArray.length()) { i -> vArray.getLong(i) }
            builder.setVibrate(pattern)
        }

        // Rich Media (BigPictureStyle)
        if (payload.has("richMedia")) {
            val rich = payload.getJSONObject("richMedia")
            val type = rich.optString("type")
            if (type == "big_picture") {
                builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
            }
        } else {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }

        // Interactive persistent action buttons
        if (payload.has("actions")) {
            val actions = payload.getJSONArray("actions")
            for (i in 0 until actions.length()) {
                val act = actions.getJSONObject(i)
                val actId = act.optString("id")
                val actTitle = act.optString("title")
                val actLink = act.optString("deepLink", deepLink)

                val btnIntent = Intent(context, MainActivity::class.java).apply {
                    data = Uri.parse(actLink)
                    putExtra("action_id", actId)
                }
                val btnPending = PendingIntent.getActivity(
                    context,
                    notifId + i + 10,
                    btnIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                builder.addAction(0, actTitle, btnPending)
            }
        }

        nm.notify(notifId, builder.build())
    }
}
