package com.lio.clocktimer.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import com.lio.clocktimer.MainActivity
import com.lio.clocktimer.R

class LarpsAppWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_WIDGET_DATA_UPDATED || intent.action == AppWidgetManager.ACTION_APPWIDGET_UPDATE) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val ids = appWidgetManager.getAppWidgetIds(
                ComponentName(context, LarpsAppWidgetProvider::class.java)
            )
            for (id in ids) {
                updateAppWidget(context, appWidgetManager, id)
            }
        }
    }

    companion object {
        const val ACTION_WIDGET_DATA_UPDATED = "com.lio.clocktimer.ACTION_WIDGET_DATA_UPDATED"

        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val prefs: SharedPreferences = context.getSharedPreferences("larps_prefs", Context.MODE_PRIVATE)
            val views = RemoteViews(context.packageName, R.layout.widget_larps_layout)

            // Read dynamic keys bound from app.widget.json
            val title = prefs.getString("widget_operative_name", "Lio")
            val status = prefs.getString("widget_vital_status", "ONLINE • ACTIVE")
            val sector = prefs.getString("widget_current_sector", "Sector 7")
            val shield = prefs.getString("widget_shield_hp", "85")?.toIntOrNull() ?: 85
            val bio = prefs.getString("widget_bio_sync", "90")?.toIntOrNull() ?: 90

            views.setTextViewText(R.id.widgetTitle, title)
            views.setTextViewText(R.id.widgetStatus, status)
            views.setTextViewText(R.id.widgetSubtitle, sector)
            views.setProgressBar(R.id.widgetShieldBar, 100, shield, false)
            views.setProgressBar(R.id.widgetBioBar, 100, bio, false)

            // Click on widget opens app
            val intent = Intent(context, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widgetRoot, pendingIntent)

            // Button 1: Quick Action
            val actionIntent = Intent(context, MainActivity::class.java).apply {
                data = Uri.parse("larps://screen/radar?source=widget")
            }
            val actionPending = PendingIntent.getActivity(
                context, 1, actionIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widgetBtn1, actionPending)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
