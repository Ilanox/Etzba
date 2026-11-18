package com.edvinstudios.etzba;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Home-screen widget, in the app's own look: the home screen's fingerprint dial (it's the button: tap to clock
 * in or out), a thin running timer, the pay so far, one status line and a thin bar that fills up to overtime.
 * Sizes: 2×1, 4×1 (default) and 4×2. Colours come from the app's current theme.
 *
 * The timer is ticked by Android itself. The dial, pay and bar are redrawn when the app changes something,
 * and about every 15 minutes while on shift, with an alarm that never wakes the phone.
 */
public class EtzbaWidget extends AppWidgetProvider {
    static final String TICK = "com.edvinstudios.etzba.WIDGET_TICK";

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
            State s = new State(ctx);
            if (Build.VERSION.SDK_INT >= 31) {
                Map<SizeF, RemoteViews> m = new HashMap<>();
                m.put(new SizeF(100f, 40f), build(ctx, s, Size.SMALL));
                m.put(new SizeF(230f, 40f), build(ctx, s, Size.WIDE));
                m.put(new SizeF(230f, 150f), build(ctx, s, Size.LARGE));
                mgr.updateAppWidget(id, new RemoteViews(m));
            } else {
                Bundle o = mgr.getAppWidgetOptions(id);
                int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250), h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 70);
                mgr.updateAppWidget(id, build(ctx, s, w < 200 ? Size.SMALL : h >= 150 ? Size.LARGE : Size.WIDE));
            }
        } catch (Exception e) {
            android.util.Log.w("Etzba", "widget draw failed", e);
        }
    }

    private enum Size { SMALL, WIDE, LARGE }

    /** Everything the app last sent, plus what follows from the clock right now. */
    private static final class State {
        final boolean active, rtl, otOn, running;
        final long start, now;
        final String job, phase, style;
        final double rate, thr, ot1h, hours, earned, frac;
        final JSONObject l, theme, month;
        final JSONArray segs;

        State(Context ctx) {
            SharedPreferences p = prefs(ctx);
            active = p.getBoolean("active", false);
            rtl = p.getBoolean("rtl", true);
            start = p.getLong("start", 0L);
            now = System.currentTimeMillis();
            String jn = p.getString("job", "");
            job = jn.isEmpty() ? "" : "\u2068" + jn + "\u2069";   // isolated: a Hebrew name inside English (or the reverse) stays in order
            rate = Double.longBitsToDouble(p.getLong("rate", 0L));
            l = obj(p.getString("labels", "{}"));
            JSONObject x = obj(p.getString("extra", "{}"));
            theme = x.optJSONObject("theme") != null ? x.optJSONObject("theme") : new JSONObject();
            month = x.optJSONObject("month") != null ? x.optJSONObject("month") : new JSONObject();
            thr = x.optDouble("thr", 8.6);
            ot1h = x.optDouble("ot1", 2);
            otOn = x.optBoolean("otOn", true);
            style = x.optString("wstyle", "classic");   // supporters: classic | glass | bold | accent
            JSONArray sg;
            try { sg = new JSONArray(p.getString("segs", "[]")); } catch (Exception e) { sg = new JSONArray(); }
            segs = sg;
            running = active && start <= now;
            hours = running ? (now - start) / 3.6e6 : 0;
            earned = running ? earned(p, now) : 0;
            // the same three phases as the app's dial: regular, first overtime, beyond
            if (!running) { phase = "idle"; frac = 0; }
            else if (!otOn || hours < thr) { phase = "reg"; frac = hours / thr; }
            else if (hours < thr + ot1h) { phase = "ot1"; frac = (hours - thr) / Math.max(ot1h, 0.01); }
            else { phase = "ot2"; frac = (hours - thr - ot1h) / 2; }
        }

        int c(String key, int fallback) {
            try { String v = theme.optString(key, ""); return v.isEmpty() ? fallback : Color.parseColor(v); } catch (Exception e) { return fallback; }
        }
        int ink() { return c("ink", 0xFFF2EDE4); }
        int muted() { return c("ink3", 0xFF9C978E); }
        int phaseColor() {
            switch (phase) {
                case "ot1": return c("ot1a", 0xFFEB6E57);
                case "ot2": return c("ot2a", 0xFFE04A3A);
                case "reg": return c("rega", 0xFF6E98E0);
                default: return muted();
            }
        }
        /** The lighter end of the phase colour, for text and the bar (easier to read on the dark card). */
        int phaseText() {
            switch (phase) {
                case "ot1": return c("ot1b", 0xFFF06A50);
                case "ot2": return c("ot2b", 0xFFE04A3A);
                case "reg": return c("regb", 0xFF6E98E0);
                default: return muted();
            }
        }
        /** The label of the rate in force right now, from the app's timeline. */
        String nowLabel() {
            String out = "";
            try {
                for (int i = 0; i < segs.length(); i++) { JSONArray sg = segs.getJSONArray(i); if (sg.getLong(0) <= now) out = sg.optString(2, out); }
            } catch (Exception ignored) { }
            return out;
        }
    }

    private static RemoteViews build(Context ctx, State s, Size size) {
        String pkg = ctx.getPackageName();
        String layout = size == Size.SMALL ? "etzba_widget_small" : size == Size.LARGE ? "etzba_widget_large" : "etzba_widget";
        RemoteViews v = new RemoteViews(pkg, res(ctx, layout, "layout"));
        int root = id(ctx, "w_root"), dial = id(ctx, "w_dial"), timer = id(ctx, "w_timer"), title = id(ctx, "w_title"),
            amt = id(ctx, "w_amt"), line = id(ctx, "w_line"), bar = id(ctx, "w_bar"), top1 = id(ctx, "w_top1"), top2 = id(ctx, "w_top2"),
            nums = id(ctx, "w_nums"), idle = id(ctx, "w_idle"), sub = id(ctx, "w_sub");
        JSONObject l = s.l;
        float dp = ctx.getResources().getDisplayMetrics().density;

        // direction and colours follow the app
        v.setInt(root, "setLayoutDirection", s.rtl ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
        // supporters' styles: see-through, big numbers, or the theme's color as the background
        int bg = s.c("surface", 0xFF1D1F23);
        if (s.style.equals("glass")) bg = (bg & 0x00FFFFFF) | 0x8C000000;
        if (s.style.equals("accent")) bg = s.c("accent", bg);
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(root, "setBackgroundTintList", ColorStateList.valueOf(bg));
        int ink = s.ink(), muted = s.muted(), pc = s.phaseText();
        if (s.style.equals("accent")) { ink = s.c("bg", 0xFF141518); muted = (ink & 0x00FFFFFF) | 0xB3000000; pc = ink; }
        if (s.style.equals("bold")) {
            // a little bigger than each layout's own sizes (small 21, standard 32/19, large 46/24), so nothing is cut off
            v.setTextViewTextSize(timer, android.util.TypedValue.COMPLEX_UNIT_SP, size == Size.SMALL ? 24 : size == Size.LARGE ? 54 : 36);
            if (size != Size.SMALL) v.setTextViewTextSize(amt, android.util.TypedValue.COMPLEX_UNIT_SP, size == Size.LARGE ? 28 : 21);
        }
        v.setTextColor(timer, ink);
        v.setTextColor(title, ink);
        v.setTextColor(line, s.running ? pc : muted);
        if (size != Size.SMALL) v.setTextColor(amt, ink);
        if (size == Size.LARGE) { v.setTextColor(top1, muted); v.setTextColor(top2, muted); v.setTextColor(sub, muted); }

        int dialDp = size == Size.SMALL ? 56 : size == Size.LARGE ? 100 : 64;
        v.setImageViewBitmap(dial, dialBitmap(s, Math.round(dialDp * dp)));

        String hhmm = new SimpleDateFormat("HH:mm", Locale.US).format(new Date(s.start));
        String money = "₪" + String.format(Locale.US, "%,.0f", s.earned);
        String rateTxt = s.rate > 0 ? "₪" + String.format(Locale.US, s.rate % 1 == 0 ? "%.0f" : "%.2f", s.rate) + " " + l.optString("perHour", "לשעה") : "";
        String status;
        if (!s.running) status = "";
        else if (s.phase.equals("reg") && s.otOn) {
            double left = Math.max(0, s.thr - s.hours); int m = (int) Math.round(left * 60);
            status = l.optString("toOt", "עוד {t} לשעות נוספות").replace("{t}", (m / 60) + ":" + String.format(Locale.US, "%02d", m % 60));
        } else status = l.optString("now", "עכשיו ") + s.nowLabel();

        if (s.running) {
            v.setViewVisibility(timer, View.VISIBLE);
            v.setChronometer(timer, SystemClock.elapsedRealtime() - (s.now - s.start), null, true);
            v.setViewVisibility(title, View.GONE);
            switch (size) {
                case SMALL:
                    v.setTextViewText(line, money + " · " + l.optString(s.phase.equals("reg") ? "shortReg" : "shortOt", ""));
                    break;
                case WIDE:
                    v.setTextViewText(amt, money);
                    v.setTextViewText(line, (s.job.isEmpty() ? "" : s.job + " · ") + status);
                    break;
                case LARGE:
                    v.setViewVisibility(nums, View.VISIBLE); v.setViewVisibility(idle, View.GONE);
                    v.setTextViewText(amt, money);
                    v.setTextViewText(top1, s.job);
                    v.setTextViewText(top2, l.optString("since", "מ־") + hhmm);
                    v.setTextViewText(line, status);
                    break;
            }
        } else {
            v.setChronometer(timer, SystemClock.elapsedRealtime(), null, false);
            boolean later = s.active;   // clocked in for a time that hasn't come yet
            String head = later ? l.optString("starts", "מתחילה ב־") + hhmm : l.optString("idle", "לא במשמרת");
            switch (size) {
                case SMALL:
                    v.setViewVisibility(timer, View.GONE); v.setViewVisibility(title, View.VISIBLE);
                    v.setTextViewText(title, head);
                    v.setTextViewText(line, l.optString("tapShort", "נגיעה להתחלה"));
                    break;
                case WIDE:
                    v.setViewVisibility(timer, View.GONE); v.setViewVisibility(title, View.VISIBLE);
                    v.setTextViewText(title, head);
                    v.setTextColor(amt, muted);
                    v.setTextViewText(amt, rateTxt);
                    v.setTextViewText(line, (s.job.isEmpty() ? "" : s.job + " · ") + l.optString("tapStart", "נגיעה בחוגה כדי להתחיל"));
                    break;
                case LARGE:
                    v.setViewVisibility(nums, View.GONE); v.setViewVisibility(idle, View.VISIBLE);
                    v.setTextViewText(title, head);
                    v.setTextViewText(sub, l.optString("tapStart", "נגיעה בחוגה כדי להתחיל"));
                    v.setTextViewText(top1, s.job);
                    v.setTextViewText(top2, rateTxt);
                    // the month so far, like the home screen's month tile
                    String mName = s.month.optString("name", ""), mGross = s.month.optString("gross", "");
                    v.setTextViewText(line, mName.isEmpty() ? "" : mName + " · " + mGross + " " + l.optString("gross", "ברוטו")
                        + " · " + s.month.optInt("count", 0) + " " + l.optString("shifts", "משמרות"));
                    break;
            }
        }

        // the thin bar: how far to overtime (full and in the overtime colour once it's started)
        if (size != Size.SMALL) {
            if (s.running && s.otOn) {
                double f = s.phase.equals("reg") ? Math.min(1, s.frac) : 1;
                v.setViewVisibility(bar, View.VISIBLE);
                v.setImageViewBitmap(bar, barBitmap(f, pc, s.c("line", 0xFF2A2D33), s.rtl));
            } else v.setViewVisibility(bar, View.GONE);
        }

        // the dial clocks in or out; anywhere else opens the app
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Intent toggle = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("etzba_action", "toggle");
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(dial, PendingIntent.getActivity(ctx, 77, toggle, flags));
        v.setOnClickPendingIntent(root, PendingIntent.getActivity(ctx, 79, open, flags));
        return v;
    }

    /* ---------- the dial: the same drawing as the app's home screen (js/app.js punchSVG + js/svg-icons.js ridges) ---------- */

    private static Bitmap dialBitmap(State s, int px) {
        Bitmap b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        float k = px / 200f;            // the app draws in a 200×200 box
        c.scale(k, k);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        // outer ring (phase colour while on shift), then the face
        p.setStyle(Paint.Style.FILL); p.setColor(s.c("bg", 0xFF141518)); c.drawCircle(100, 100, 99, p);
        p.setStyle(Paint.Style.STROKE);
        boolean on = s.running;
        boolean gold = s.theme.has("ring");   // supporters: a ring in the theme's color when not on shift (gold in the gold theme)
        p.setStrokeWidth(on ? 4f : gold ? 3f : 1.5f); p.setColor(on ? s.phaseColor() : gold ? s.c("ring", 0xFFD9A93F) : s.c("line", 0xFF2E3036));
        c.drawCircle(100, 100, on ? 97.5f : gold ? 98f : 98.5f, p);
        p.setStyle(Paint.Style.FILL); p.setColor(s.c("surface", 0xFF1D1F23)); c.drawCircle(100, 100, 90, p);

        // ridges: base, then the part that has filled
        c.save(); c.translate(30, 36); c.scale(1.4f, 1.4f);
        p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeWidth(2.6f);
        float[][] arcs = ridgeArcs();
        p.setShader(null); p.setColor(s.c("line", 0xFF2E3036));
        for (float[] a : arcs) c.drawPath(arcPath(a, 1f), p);
        if (on) {
            String under = s.phase.equals("ot1") ? "reg" : s.phase.equals("ot2") ? "ot1" : null;
            if (under != null) { p.setShader(grad(s, under)); for (float[] a : arcs) c.drawPath(arcPath(a, 1f), p); }
            p.setShader(grad(s, s.phase));
            double total = 0; double[] len = new double[arcs.length];
            for (int i = 0; i < arcs.length; i++) { len[i] = arcLength(arcs[i]); total += len[i]; }
            double target = Math.max(0, Math.min(1, s.frac)) * total;
            for (int i = 0; i < arcs.length && target > 0; i++) {
                float f = (float) Math.min(1, target / len[i]); target -= len[i];
                c.drawPath(arcPath(arcs[i], f), p);
            }
            p.setShader(null);
        }

        // clock hands at the core, showing the time now
        Calendar cal = Calendar.getInstance();
        double m = cal.get(Calendar.MINUTE) + cal.get(Calendar.SECOND) / 60.0, h = (cal.get(Calendar.HOUR) % 12) + m / 60;
        p.setColor(s.ink());
        hand(c, p, m * 6, 21, 3.6f);
        hand(c, p, h * 30, 12, 4.2f);
        p.setStyle(Paint.Style.FILL); p.setColor(s.c("hub", 0xFFEB6E57)); c.drawCircle(50, 52, 3.4f, p);
        c.restore();
        return b;
    }

    private static void hand(Canvas c, Paint p, double deg, float len, float w) {
        double r = Math.toRadians(deg);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(w);
        c.drawLine(50, 52, (float) (50 + len * Math.sin(r)), (float) (52 - len * Math.cos(r)), p);
    }

    private static Shader grad(State s, String phase) {
        String a = phase.equals("ot1") ? "ot1" : phase.equals("ot2") ? "ot2" : "reg";
        int ca = s.c(a + "a", 0xFF6E98E0), cb = s.c(a + "b", ca);
        return new LinearGradient(0, 100, 100, 0, ca, cb, Shader.TileMode.CLAMP);   // bottom-left to top-right, like the app
    }

    /** Ridge arcs as {cx, cy, rx, ry, a0, a1} (degrees), in the order the app fills them. */
    private static float[][] ridgeArcs() {
        java.util.List<float[]> out = new java.util.ArrayList<>();
        float cx = 50, cy = 52, step = 6.2f, start = 6.5f;
        for (int i = 0; i < 7; i++) {
            float rx = start + i * step, ry = rx * 1.17f, g = 28 + i * 2.5f, a0 = 90 + g, a1 = 450 - g;
            if (i % 2 == 1) {
                float br = 200 + ((i * 47) % 130), bw = 9;
                out.add(new float[]{cx, cy, rx, ry, a0, br});
                out.add(new float[]{cx, cy, rx, ry, br + bw, a1});
            } else out.add(new float[]{cx, cy, rx, ry, a0, a1});
        }
        return out.toArray(new float[0][]);
    }

    private static Path arcPath(float[] a, float f) {
        Path path = new Path();
        float a0 = a[4], a1 = a0 + (a[5] - a[4]) * f;
        int n = Math.max(2, (int) Math.ceil((a1 - a0) / 2));
        for (int i = 0; i <= n; i++) {
            double t = Math.toRadians(a0 + (a1 - a0) * i / n);
            float x = (float) (a[0] + a[2] * Math.cos(t)), y = (float) (a[1] + a[3] * Math.sin(t));
            if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
        }
        return path;
    }

    private static double arcLength(float[] a) {
        double sum = 0, px = 0, py = 0;
        int n = 120;
        for (int i = 0; i <= n; i++) {
            double t = Math.toRadians(a[4] + (a[5] - a[4]) * i / (double) n);
            double x = a[0] + a[2] * Math.cos(t), y = a[1] + a[3] * Math.sin(t);
            if (i > 0) sum += Math.hypot(x - px, y - py);
            px = x; py = y;
        }
        return sum;
    }

    /** The thin bottom bar, filling from the reading start (right in Hebrew). */
    private static Bitmap barBitmap(double f, int color, int track, boolean rtl) {
        int w = 400, h = 4;
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint();
        p.setColor(track); c.drawRect(0, 0, w, h, p);
        p.setColor(color);
        float fw = (float) (w * Math.max(0, Math.min(1, f)));
        if (rtl) c.drawRect(w - fw, 0, w, h, p); else c.drawRect(0, 0, fw, h, p);
        return b;
    }

    /** Gross pay so far: each stretch of the shift at its own rate (segs: [[fromMs, perHour, label], …]). */
    static double earned(SharedPreferences p, long now) {
        try {
            JSONArray segs = new JSONArray(p.getString("segs", "[]"));
            double sum = 0;
            for (int i = 0; i < segs.length(); i++) {
                JSONArray s = segs.getJSONArray(i);
                long from = s.getLong(0), to = i + 1 < segs.length() ? segs.getJSONArray(i + 1).getLong(0) : Long.MAX_VALUE;
                long b = Math.min(to, now);
                if (b > from) sum += (b - from) / 3.6e6 * s.getDouble(1);
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

    private static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(AppActionsPlugin.PREFS, Context.MODE_PRIVATE); }
    private static JSONObject obj(String s) { try { return new JSONObject(s); } catch (Exception e) { return new JSONObject(); } }
    private static int id(Context ctx, String name) { return res(ctx, name, "id"); }
    private static int res(Context ctx, String name, String type) { return ctx.getResources().getIdentifier(name, type, ctx.getPackageName()); }
}
