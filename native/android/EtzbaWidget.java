package com.edvinstudios.etzba;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Home-screen widget. Three sizes: compact (about 2×1), standard (4×1) and expanded (4×2).
 * The timer is drawn by Android itself (no app wake-ups). Pay so far is worked out here from the pay-rate
 * timeline the app sends (regular → overtime → Shabbat…), and redrawn about every 15 minutes, only while on
 * shift, with an alarm that never wakes the phone. Tapping opens אצבע to clock in, or to confirm clocking out.
 */
public class EtzbaWidget extends AppWidgetProvider {
    static final String TICK = "com.edvinstudios.etzba.WIDGET_TICK";
    private static final int CREAM = 0xFFEFEAE0, MUTED = 0xFFB5AFA3, ACCENT = 0xFFFF6A3D, WHITE = 0xFFFFFFFF;

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) draw(ctx, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle options) {
        draw(ctx, mgr, id);   // resized: older Android picks the layout here
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (TICK.equals(intent.getAction())) refresh(ctx);
    }

    @Override
    public void onDisabled(Context ctx) { schedule(ctx, false); }

    /** Redraws every widget. Never throws: a widget problem must not close the app. */
    static void refresh(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, EtzbaWidget.class));
            boolean any = ids != null && ids.length > 0;
            if (any) for (int id : ids) draw(ctx, mgr, id);
            schedule(ctx, any && prefs(ctx).getBoolean("active", false));
        } catch (Exception e) {
            android.util.Log.w("Etzba", "widget refresh failed", e);
        }
    }

    private static void draw(Context ctx, AppWidgetManager mgr, int id) {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                Map<SizeF, RemoteViews> m = new HashMap<>();
                m.put(new SizeF(100f, 40f), build(ctx, "etzba_widget_small"));
                m.put(new SizeF(220f, 40f), build(ctx, "etzba_widget"));
                m.put(new SizeF(220f, 110f), build(ctx, "etzba_widget_large"));
                mgr.updateAppWidget(id, new RemoteViews(m));
            } else {
                Bundle o = mgr.getAppWidgetOptions(id);
                int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250), h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 60);
                mgr.updateAppWidget(id, build(ctx, w < 200 ? "etzba_widget_small" : h >= 110 ? "etzba_widget_large" : "etzba_widget"));
            }
        } catch (Exception e) {
            android.util.Log.w("Etzba", "widget draw failed", e);
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(AppActionsPlugin.PREFS, Context.MODE_PRIVATE);
    }

    private static RemoteViews build(Context ctx, String layoutName) {
        SharedPreferences p = prefs(ctx);
        boolean active = p.getBoolean("active", false), rtl = p.getBoolean("rtl", true);
        long start = p.getLong("start", 0L), now = System.currentTimeMillis();
        String job = p.getString("job", "");
        double rate = Double.longBitsToDouble(p.getLong("rate", 0L));
        JSONObject l;
        try { l = new JSONObject(p.getString("labels", "{}")); } catch (Exception e) { l = new JSONObject(); }

        String pkg = ctx.getPackageName();
        RemoteViews v = new RemoteViews(pkg, res(ctx, layoutName, "layout"));
        boolean small = layoutName.endsWith("small"), large = layoutName.endsWith("large");
        int root = id(ctx, "w_root"), title = id(ctx, "w_title"), timer = id(ctx, "w_timer"), btn = id(ctx, "w_btn"),
            mark = id(ctx, "w_mark"), sub = id(ctx, "w_sub"), pay = id(ctx, "w_pay"), status = id(ctx, "w_status"),
            dot = id(ctx, "w_dot"), jobV = id(ctx, "w_job");

        // the app's language decides the direction, not the phone's
        v.setInt(root, "setLayoutDirection", rtl ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
        String hhmm = new SimpleDateFormat("HH:mm", Locale.US).format(new Date(start));
        boolean future = active && start > now, running = active && !future;

        v.setInt(root, "setBackgroundResource", res(ctx, running ? "widget_bg_active" : "widget_bg", "drawable"));
        v.setInt(mark, "setColorFilter", small ? WHITE : running ? ACCENT : CREAM);
        if (!small) v.setInt(btn, "setBackgroundResource", res(ctx, running ? "widget_btn_out" : "widget_btn", "drawable"));
        if (!small) v.setTextColor(btn, running ? ACCENT : WHITE);
        if (small) v.setInt(btn, "setBackgroundResource", res(ctx, running ? "widget_btn_out" : "widget_btn", "drawable"));
        if (small) v.setInt(mark, "setColorFilter", running ? ACCENT : WHITE);

        if (running) {
            v.setViewVisibility(timer, View.VISIBLE);
            v.setChronometer(timer, SystemClock.elapsedRealtime() - (now - start), null, true);
            v.setViewVisibility(title, View.GONE);
            String money = "₪" + String.format(Locale.US, "%,.0f", earned(p, now));
            if (small) v.setTextViewText(sub, money + " · " + l.optString("sofar", "עד עכשיו"));
            else {
                v.setViewVisibility(pay, View.VISIBLE);
                v.setTextViewText(pay, large ? money + " " + l.optString("sofar", "עד עכשיו") : money);
                v.setViewVisibility(dot, View.VISIBLE);
                v.setTextViewText(status, large ? l.optString("on", "במשמרת") + " · " + l.optString("since", "מ־") + hhmm
                    : l.optString("on", "במשמרת") + (job.isEmpty() ? "" : " · " + job));
                v.setTextViewText(btn, l.optString("end", "יציאה"));
                if (large) { v.setTextViewText(jobV, job); v.setTextViewText(sub, ""); v.setViewVisibility(sub, View.GONE); }
            }
        } else {
            v.setViewVisibility(timer, View.GONE);
            v.setChronometer(timer, SystemClock.elapsedRealtime(), null, false);
            v.setViewVisibility(title, View.VISIBLE);
            String head = future ? l.optString("starts", "מתחילה ב־") + hhmm : l.optString("idle", "לא במשמרת");
            v.setTextViewText(title, head);
            String rateTxt = rate > 0 ? "₪" + String.format(Locale.US, rate % 1 == 0 ? "%.0f" : "%.2f", rate) + " " + l.optString("perHour", "לשעה") : "";
            if (small) v.setTextViewText(sub, l.optString("idleHint", "שמים אצבע כדי להתחיל"));
            else {
                v.setViewVisibility(dot, View.GONE);
                v.setViewVisibility(pay, View.GONE);
                v.setTextViewText(status, large ? "" : (job.isEmpty() ? l.optString("idleHint", "") : job + (rateTxt.isEmpty() ? "" : " · " + rateTxt)));
                v.setTextViewText(btn, future ? l.optString("open", "פתיחה") : l.optString("start", "כניסה"));
                if (large) {
                    v.setTextViewText(jobV, job);
                    v.setViewVisibility(sub, View.VISIBLE);
                    v.setTextViewText(sub, rateTxt.isEmpty() ? l.optString("idleHint", "") : rateTxt);
                }
            }
        }

        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("etzba_action", "toggle");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(ctx, 77, open, flags);
        v.setOnClickPendingIntent(root, pi);
        v.setOnClickPendingIntent(btn, pi);
        return v;
    }

    /** Gross pay so far: each stretch of the shift at its own rate (segs: [[fromMs, perHour], …]). */
    static double earned(SharedPreferences p, long now) {
        try {
            JSONArray segs = new JSONArray(p.getString("segs", "[]"));
            double sum = 0;
            for (int i = 0; i < segs.length(); i++) {
                JSONArray s = segs.getJSONArray(i);
                long from = s.getLong(0), to = i + 1 < segs.length() ? segs.getJSONArray(i + 1).getLong(0) : Long.MAX_VALUE;
                long a = Math.max(from, 0), b = Math.min(to, now);
                if (b > a) sum += (b - a) / 3.6e6 * s.getDouble(1);
            }
            return sum;
        } catch (Exception e) {
            return 0;
        }
    }

    /** About every 15 minutes while on shift, only when the phone is awake anyway. */
    private static void schedule(Context ctx, boolean on) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(ctx, EtzbaWidget.class).setAction(TICK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 78, i, flags);
        if (on) am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + AlarmManager.INTERVAL_FIFTEEN_MINUTES,
            AlarmManager.INTERVAL_FIFTEEN_MINUTES, pi);
        else am.cancel(pi);
    }

    private static int id(Context ctx, String name) { return res(ctx, name, "id"); }
    private static int res(Context ctx, String name, String type) { return ctx.getResources().getIdentifier(name, type, ctx.getPackageName()); }
}
