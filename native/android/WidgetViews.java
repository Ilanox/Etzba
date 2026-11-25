package com.edvinstudios.etzba;

import android.app.PendingIntent;
import android.content.Context;
import android.content.res.ColorStateList;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Fills one of the widget's layouts for a given size. */
final class WidgetViews {
    private WidgetViews() { }

    /** The sizes the widget has a layout for: narrow (one column) and wide, short to tall. */
    enum Size {
        SMALL("etzba_widget_small", 56), TALL("etzba_widget_tall", 76), TALLER("etzba_widget_tall", 92),
        WIDE("etzba_widget", 64), LARGE("etzba_widget_large", 100);

        final String layout; final int dialDp;
        Size(String layout, int dialDp) { this.layout = layout; this.dialDp = dialDp; }
        /** One narrow column: no amount line and no progress bar. */
        boolean narrow() { return this == SMALL || this == TALL || this == TALLER; }
        boolean tall() { return this == TALL || this == TALLER; }
    }

    /** The views in the layouts. Not every layout has every view; RemoteViews ignores the missing ones. */
    private static final class Ids {
        final int root, dial, timer, title, amt, line, bar, top1, top2, nums, idle, sub, month;
        Ids(Context ctx) {
            root = id(ctx, "w_root"); dial = id(ctx, "w_dial"); timer = id(ctx, "w_timer"); title = id(ctx, "w_title");
            amt = id(ctx, "w_amt"); line = id(ctx, "w_line"); bar = id(ctx, "w_bar"); top1 = id(ctx, "w_top1"); top2 = id(ctx, "w_top2");
            nums = id(ctx, "w_nums"); idle = id(ctx, "w_idle"); sub = id(ctx, "w_sub"); month = id(ctx, "w_month");
        }
    }

    static RemoteViews build(Context ctx, WidgetState s, Size size) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), res(ctx, size.layout, "layout"));
        Ids id = new Ids(ctx);
        Texts t = new Texts(s);

        int ink = s.ink(), muted = s.muted(), pc = s.phaseText();
        if (s.style.equals("accent")) { ink = s.color("bg", 0xFF141518); muted = (ink & 0x00FFFFFF) | 0xB3000000; pc = ink; }
        style(v, id, s, size, ink, muted, pc);

        float dp = ctx.getResources().getDisplayMetrics().density;
        v.setImageViewBitmap(id.dial, WidgetArt.dial(s, Math.round(size.dialDp * dp)));

        if (s.running) running(v, id, s, size, t); else idle(v, id, s, size, t);
        if (size.tall()) monthLine(v, id, s, size, t, muted);
        if (!size.narrow()) {
            if (s.running && s.otOn) {
                v.setViewVisibility(id.bar, View.VISIBLE);
                v.setImageViewBitmap(id.bar, WidgetArt.bar(s.phase.equals("reg") ? Math.min(1, s.frac) : 1, pc, s.color("line", 0xFF2A2D33), s.rtl));
            } else v.setViewVisibility(id.bar, View.GONE);
        }

        // the dial clocks in or out; anywhere else opens the app
        v.setOnClickPendingIntent(id.dial, PendingIntent.getActivity(ctx, 77, Launch.action(ctx, "toggle"), Launch.FLAGS));
        v.setOnClickPendingIntent(id.root, PendingIntent.getActivity(ctx, 79, Launch.open(ctx), Launch.FLAGS));
        return v;
    }

    /** Direction, background and text colours follow the app; the "bold" style makes the numbers bigger. */
    private static void style(RemoteViews v, Ids id, WidgetState s, Size size, int ink, int muted, int pc) {
        v.setInt(id.root, "setLayoutDirection", s.rtl ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
        int bg = s.color("surface", 0xFF1D1F23);
        if (s.style.equals("glass")) bg = (bg & 0x00FFFFFF) | 0x8C000000;
        if (s.style.equals("accent")) bg = s.color("accent", bg);
        if (android.os.Build.VERSION.SDK_INT >= 31) v.setColorStateList(id.root, "setBackgroundTintList", ColorStateList.valueOf(bg));
        if (s.style.equals("bold")) {
            v.setTextViewTextSize(id.timer, TypedValue.COMPLEX_UNIT_SP, size == Size.SMALL ? 24 : size.tall() ? 30 : size == Size.LARGE ? 54 : 36);
            if (!size.narrow()) v.setTextViewTextSize(id.amt, TypedValue.COMPLEX_UNIT_SP, size == Size.LARGE ? 28 : 21);
        }
        v.setTextColor(id.timer, ink);
        v.setTextColor(id.title, ink);
        v.setTextColor(id.line, s.running ? pc : muted);
        if (!size.narrow()) v.setTextColor(id.amt, ink);
        if (size == Size.LARGE) { v.setTextColor(id.top1, muted); v.setTextColor(id.top2, muted); v.setTextColor(id.sub, muted); }
    }

    /** On shift: a running timer, the pay so far and what rate applies. */
    private static void running(RemoteViews v, Ids id, WidgetState s, Size size, Texts t) {
        v.setViewVisibility(id.timer, View.VISIBLE);
        v.setChronometer(id.timer, SystemClock.elapsedRealtime() - (s.now - s.start), null, true);
        v.setViewVisibility(id.title, View.GONE);
        switch (size) {
            case SMALL: case TALL: case TALLER:
                v.setTextViewText(id.line, t.money + " · " + s.label(s.phase.equals("reg") ? "shortReg" : "shortOt", ""));
                break;
            case WIDE:
                v.setViewVisibility(id.amt, View.VISIBLE);
                v.setTextViewText(id.amt, t.money);
                v.setTextViewText(id.line, t.jobDot + t.status);
                break;
            case LARGE:
                v.setViewVisibility(id.nums, View.VISIBLE); v.setViewVisibility(id.idle, View.GONE);
                v.setTextViewText(id.amt, t.money);
                v.setTextViewText(id.top1, s.job);
                v.setTextViewText(id.top2, t.since);
                v.setTextViewText(id.line, t.status);
                break;
        }
    }

    /** Not on shift (or a planned one hasn't started): what to tap, the rate and the month so far. */
    private static void idle(RemoteViews v, Ids id, WidgetState s, Size size, Texts t) {
        v.setChronometer(id.timer, SystemClock.elapsedRealtime(), null, false);
        String head = s.active ? s.label("starts", "מתחילה ב־") + t.hhmm : s.label("idle", "לא במשמרת");
        String tap = s.label("tapShort", "נגיעה להתחלה");
        switch (size) {
            case SMALL: case TALL: case TALLER:
                v.setViewVisibility(id.timer, View.GONE); v.setViewVisibility(id.title, View.VISIBLE);
                v.setTextViewText(id.title, head);
                v.setTextViewText(id.line, tap);
                break;
            case WIDE:
                v.setViewVisibility(id.timer, View.GONE); v.setViewVisibility(id.title, View.VISIBLE);
                v.setTextViewText(id.title, head);
                v.setViewVisibility(id.amt, View.GONE);
                v.setTextViewText(id.line, t.jobDot + (t.rate.isEmpty() ? tap : t.rate));
                break;
            case LARGE:
                v.setViewVisibility(id.nums, View.GONE); v.setViewVisibility(id.idle, View.VISIBLE);
                v.setTextViewText(id.title, head);
                v.setTextViewText(id.sub, s.label("tapStart", "נגיעה בחוגה כדי להתחיל"));
                v.setTextViewText(id.top1, s.job);
                v.setTextViewText(id.top2, t.rate);
                // the month so far, like the home screen's month tile
                v.setTextViewText(id.line, t.monthName.isEmpty() ? "" : t.monthGross + " · " + s.month.optInt("count", 0) + " " + s.label("shifts", "משמרות"));
                break;
        }
    }

    /** The tallest narrow size has room for two more lines: the job and start time, or the job, rate and month. */
    private static void monthLine(RemoteViews v, Ids id, WidgetState s, Size size, Texts t, int muted) {
        if (size != Size.TALLER) { v.setViewVisibility(id.month, View.GONE); return; }
        String txt = s.running ? (s.job.isEmpty() ? "" : s.job + "\n") + t.since
            : (s.job.isEmpty() ? "" : s.job + (t.rate.isEmpty() ? "" : " · " + t.rate) + "\n") + (t.monthName.isEmpty() ? "" : t.monthGross);
        txt = txt.trim();
        v.setTextViewText(id.month, txt);
        v.setTextColor(id.month, muted);
        v.setViewVisibility(id.month, txt.isEmpty() ? View.GONE : View.VISIBLE);
    }

    /** The widget's texts, in the app's language. */
    private static final class Texts {
        final String hhmm, money, rate, status, since, jobDot, monthName, monthGross;
        Texts(WidgetState s) {
            hhmm = new SimpleDateFormat("HH:mm", Locale.US).format(new Date(s.start));
            money = "₪" + String.format(Locale.US, "%,.0f", s.earned);
            rate = s.rate > 0 ? "₪" + String.format(Locale.US, s.rate % 1 == 0 ? "%.0f" : "%.2f", s.rate) + " " + s.label("perHour", "לשעה") : "";
            since = s.label("since", "מ־") + hhmm;
            jobDot = s.job.isEmpty() ? "" : s.job + " · ";
            monthName = s.month.optString("name", "");
            monthGross = monthName + " · " + s.month.optString("gross", "") + " " + s.label("gross", "ברוטו");
            if (!s.running) status = "";
            else if (s.phase.equals("reg") && s.otOn) {
                int m = (int) Math.round(Math.max(0, s.thr - s.hours) * 60);
                status = s.label("toOt", "עוד {t} לשעות נוספות").replace("{t}", (m / 60) + ":" + String.format(Locale.US, "%02d", m % 60));
            } else status = s.label("now", "עכשיו ") + s.nowLabel();
        }
    }

    private static int id(Context ctx, String name) { return res(ctx, name, "id"); }
    private static int res(Context ctx, String name, String type) { return ctx.getResources().getIdentifier(name, type, ctx.getPackageName()); }
}
