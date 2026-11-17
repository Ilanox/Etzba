package com.edvinstudios.etzba;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Home-screen widget: shows whether you're on shift, with a running timer (drawn by Android itself, so the
 * app isn't woken every second). Tapping it opens אצבע to clock in, or to the end-shift screen.
 */
public class EtzbaWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, EtzbaWidget.class));
        if (ids != null && ids.length > 0) for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    private static RemoteViews views(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(AppActionsPlugin.PREFS, Context.MODE_PRIVATE);
        boolean active = p.getBoolean("active", false);
        long start = p.getLong("start", 0L);
        String job = p.getString("job", "");
        JSONObject l;
        try { l = new JSONObject(p.getString("labels", "{}")); } catch (Exception e) { l = new JSONObject(); }

        int layout = ctx.getResources().getIdentifier("etzba_widget", "layout", ctx.getPackageName());
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
        int title = id(ctx, "w_title"), sub = id(ctx, "w_sub"), timer = id(ctx, "w_timer"), btn = id(ctx, "w_btn"), root = id(ctx, "w_root");
        long now = System.currentTimeMillis();
        String hhmm = new SimpleDateFormat("HH:mm", Locale.US).format(new Date(start));

        if (active && start > now) {
            v.setTextViewText(title, l.optString("starts", "המשמרת מתחילה ב־") + hhmm);
            v.setTextViewText(sub, job);
            v.setViewVisibility(timer, View.GONE);
            v.setTextViewText(btn, l.optString("open", "פתיחה"));
        } else if (active) {
            v.setTextViewText(title, l.optString("since", "במשמרת מ־") + hhmm);
            v.setTextViewText(sub, job);
            v.setViewVisibility(timer, View.VISIBLE);
            v.setChronometer(timer, SystemClock.elapsedRealtime() - (now - start), null, true);
            v.setTextViewText(btn, l.optString("end", "סיום"));
        } else {
            v.setTextViewText(title, l.optString("idle", "לא במשמרת"));
            v.setTextViewText(sub, job.isEmpty() ? l.optString("idleHint", "שמים אצבע כדי להתחיל") : job);
            v.setViewVisibility(timer, View.GONE);
            v.setChronometer(timer, SystemClock.elapsedRealtime(), null, false);
            v.setTextViewText(btn, l.optString("start", "כניסה"));
        }

        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("etzba_action", "toggle");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(ctx, 77, open, flags);
        v.setOnClickPendingIntent(root, pi);
        v.setOnClickPendingIntent(btn, pi);
        return v;
    }

    private static int id(Context ctx, String name) {
        return ctx.getResources().getIdentifier(name, "id", ctx.getPackageName());
    }
}
