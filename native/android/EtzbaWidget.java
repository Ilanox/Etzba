package com.edvinstudios.etzba;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.SizeF;
import android.widget.RemoteViews;

import org.json.JSONArray;

import java.util.HashMap;
import java.util.Map;

import com.edvinstudios.etzba.WidgetViews.Size;

/**
 * The home screen widget. The app saves what to show (AppActionsPlugin.updateWidget), which calls refresh();
 * while a shift runs, alarms redraw it every 15 minutes and right when the pay rate changes.
 * The timer itself is a Chronometer, so it ticks without redrawing.
 */
public class EtzbaWidget extends AppWidgetProvider {
    static final String TICK = "com.edvinstudios.etzba.WIDGET_TICK";
    private static final int REQ_REPEAT = 78, REQ_RATE_CHANGE = 79;

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) draw(ctx, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle options) {
        draw(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (TICK.equals(intent.getAction())) refresh(ctx);
    }

    @Override
    public void onDisabled(Context ctx) { schedule(ctx, false); }

    /** Redraws every widget on the home screen and keeps the alarms in step with the shift. */
    static void refresh(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, EtzbaWidget.class));
            boolean any = ids != null && ids.length > 0;
            if (any) for (int id : ids) draw(ctx, mgr, id);
            schedule(ctx, any && WidgetState.prefs(ctx).getBoolean("active", false));
        } catch (Exception e) {
            android.util.Log.w("Etzba", "widget refresh failed", e);
        }
    }

    /** Android 12 and up pick the layout by the widget's size themselves; before that, by the size it reports. */
    private static void draw(Context ctx, AppWidgetManager mgr, int id) {
        try {
            WidgetState s = new WidgetState(ctx);
            if (Build.VERSION.SDK_INT >= 31) {
                Map<SizeF, RemoteViews> m = new HashMap<>();
                m.put(new SizeF(100f, 40f), WidgetViews.build(ctx, s, Size.SMALL));
                m.put(new SizeF(100f, 120f), WidgetViews.build(ctx, s, Size.TALL));
                m.put(new SizeF(100f, 185f), WidgetViews.build(ctx, s, Size.TALLER));
                m.put(new SizeF(230f, 40f), WidgetViews.build(ctx, s, Size.WIDE));
                m.put(new SizeF(230f, 150f), WidgetViews.build(ctx, s, Size.LARGE));
                mgr.updateAppWidget(id, new RemoteViews(m));
            } else {
                Bundle o = mgr.getAppWidgetOptions(id);
                int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250), h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 70);
                Size size = w < 200 ? (h >= 185 ? Size.TALLER : h >= 120 ? Size.TALL : Size.SMALL) : h >= 150 ? Size.LARGE : Size.WIDE;
                mgr.updateAppWidget(id, WidgetViews.build(ctx, s, size));
            }
        } catch (Exception e) {
            android.util.Log.w("Etzba", "widget draw failed", e);
        }
    }

    /** While on shift: a redraw every 15 minutes, and one just after the next rate change. Off shift: none. */
    private static void schedule(Context ctx, boolean on) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent repeat = tick(ctx, REQ_REPEAT), rateChange = tick(ctx, REQ_RATE_CHANGE);
        am.cancel(rateChange);
        if (!on) { am.cancel(repeat); return; }
        am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + AlarmManager.INTERVAL_FIFTEEN_MINUTES,
            AlarmManager.INTERVAL_FIFTEEN_MINUTES, repeat);
        long next = nextRateChange(WidgetState.segments(WidgetState.prefs(ctx)), System.currentTimeMillis());
        if (next > 0) am.setAndAllowWhileIdle(AlarmManager.RTC, next + 1000, rateChange);
    }

    private static PendingIntent tick(Context ctx, int req) {
        return PendingIntent.getBroadcast(ctx, req, new Intent(ctx, EtzbaWidget.class).setAction(TICK), Launch.FLAGS);
    }

    /** When the next rate segment starts, or 0 if none is left. */
    private static long nextRateChange(JSONArray segs, long now) {
        try {
            for (int k = 0; k < segs.length(); k++) { long t = segs.getJSONArray(k).getLong(0); if (t > now) return t; }
        } catch (Exception ignored) { }
        return 0;
    }
}
