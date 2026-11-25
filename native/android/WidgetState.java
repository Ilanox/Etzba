package com.edvinstudios.etzba;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the widget shows, read from what the app last saved (AppActionsPlugin.updateWidget):
 * the running shift, the pay rate segments, the labels in the app's language and the theme colours.
 */
final class WidgetState {
    final boolean active, rtl, otOn, running;
    final long start, now;
    final String job, phase, style;
    final double rate, thr, ot1h, hours, earned, frac;
    final JSONObject labels, theme, month;
    final JSONArray segs;

    WidgetState(Context ctx) {
        SharedPreferences p = prefs(ctx);
        active = p.getBoolean("active", false);
        rtl = p.getBoolean("rtl", true);
        start = p.getLong("start", 0L);
        now = System.currentTimeMillis();
        String jn = p.getString("job", "");
        job = jn.isEmpty() ? "" : "⁨" + jn + "⁩";   // isolated, so a Latin job name sits right in Hebrew text
        rate = Double.longBitsToDouble(p.getLong("rate", 0L));
        labels = obj(p.getString("labels", "{}"));
        JSONObject x = obj(p.getString("extra", "{}"));
        theme = x.optJSONObject("theme") != null ? x.optJSONObject("theme") : new JSONObject();
        month = x.optJSONObject("month") != null ? x.optJSONObject("month") : new JSONObject();
        thr = x.optDouble("thr", 8.6);
        ot1h = x.optDouble("ot1", 2);
        otOn = x.optBoolean("otOn", true);
        style = x.optString("wstyle", "classic");
        segs = segments(p);
        running = active && start <= now;
        hours = running ? (now - start) / 3.6e6 : 0;
        earned = running ? earned(segs, now) : 0;
        // the phase and how far into it the shift is (0–1): regular hours, the first overtime hours, then the rest
        if (!running) { phase = "idle"; frac = 0; }
        else if (!otOn || hours < thr) { phase = "reg"; frac = hours / thr; }
        else if (hours < thr + ot1h) { phase = "ot1"; frac = (hours - thr) / Math.max(ot1h, 0.01); }
        else { phase = "ot2"; frac = (hours - thr - ot1h) / 2; }
    }

    /** A colour from the app's theme, or the fallback. */
    int color(String key, int fallback) {
        try { String v = theme.optString(key, ""); return v.isEmpty() ? fallback : Color.parseColor(v); } catch (Exception e) { return fallback; }
    }
    int ink() { return color("ink", 0xFFF2EDE4); }
    int muted() { return color("ink3", 0xFF9C978E); }

    /** The ring colour for the current phase. */
    int phaseColor() {
        switch (phase) {
            case "ot1": return color("ot1a", 0xFFEB6E57);
            case "ot2": return color("ot2a", 0xFFE04A3A);
            case "reg": return color("rega", 0xFF6E98E0);
            default: return muted();
        }
    }

    /** The text colour for the current phase. */
    int phaseText() {
        switch (phase) {
            case "ot1": return color("ot1b", 0xFFF06A50);
            case "ot2": return color("ot2b", 0xFFE04A3A);
            case "reg": return color("regb", 0xFF6E98E0);
            default: return muted();
        }
    }

    /** The name of the rate that applies now ("150%", "Shabbat"…), from the segment that has started last. */
    String nowLabel() {
        String out = "";
        try {
            for (int i = 0; i < segs.length(); i++) { JSONArray sg = segs.getJSONArray(i); if (sg.getLong(0) <= now) out = sg.optString(2, out); }
        } catch (Exception ignored) { }
        return out;
    }

    String label(String key, String fallback) { return labels.optString(key, fallback); }

    /** The shift's rate segments: [from (ms), pay per hour, label], in time order. */
    static JSONArray segments(SharedPreferences p) {
        try { return new JSONArray(p.getString("segs", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    /** Pay earned until now: each segment's rate for the time spent in it. */
    static double earned(JSONArray segs, long now) {
        try {
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

    static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(AppActionsPlugin.PREFS, Context.MODE_PRIVATE); }

    private static JSONObject obj(String s) { try { return new JSONObject(s); } catch (Exception e) { return new JSONObject(); } }
}
