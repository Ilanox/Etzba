package com.edvinstudios.etzba;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/** The widget's pictures: the fingerprint dial (same drawing as the app's) and the progress bar. */
final class WidgetArt {
    private WidgetArt() { }

    // the dial is drawn on a 200×200 grid; the fingerprint sits on a 100×100 grid centred at (50, 52)
    private static final float CX = 50, CY = 52;
    private static final float[][] RIDGES = ridges();

    /** The dial: face, ring in the phase colour, fingerprint ridges filling as the shift goes on, and clock hands. */
    static Bitmap dial(WidgetState s, int px) {
        Bitmap b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.scale(px / 200f, px / 200f);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        // outer ring (phase colour while on shift, gold for supporters), then the face
        boolean on = s.running, gold = s.theme.has("ring");
        p.setStyle(Paint.Style.FILL); p.setColor(s.color("bg", 0xFF141518)); c.drawCircle(100, 100, 99, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(on ? 4f : gold ? 3f : 1.5f);
        p.setColor(on ? s.phaseColor() : gold ? s.color("ring", 0xFFD9A93F) : s.color("line", 0xFF2E3036));
        c.drawCircle(100, 100, on ? 97.5f : gold ? 98f : 98.5f, p);
        p.setStyle(Paint.Style.FILL); p.setColor(s.color("surface", 0xFF1D1F23)); c.drawCircle(100, 100, 90, p);

        // ridges: the base, then the phase before (full) and the current phase (partly filled)
        c.save(); c.translate(30, 36); c.scale(1.4f, 1.4f);
        p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeWidth(2.6f);
        p.setShader(null); p.setColor(s.color("line", 0xFF2E3036));
        for (float[] a : RIDGES) c.drawPath(arc(a, 1f), p);
        if (on) {
            String before = s.phase.equals("ot1") ? "reg" : s.phase.equals("ot2") ? "ot1" : null;
            if (before != null) { p.setShader(gradient(s, before)); for (float[] a : RIDGES) c.drawPath(arc(a, 1f), p); }
            p.setShader(gradient(s, s.phase));
            fill(c, p, Math.max(0, Math.min(1, s.frac)));
            p.setShader(null);
        }

        // clock hands at the core, showing the time now
        Calendar cal = Calendar.getInstance();
        double m = cal.get(Calendar.MINUTE) + cal.get(Calendar.SECOND) / 60.0, h = (cal.get(Calendar.HOUR) % 12) + m / 60;
        p.setColor(s.ink());
        hand(c, p, m * 6, 21, 3.6f);
        hand(c, p, h * 30, 12, 4.2f);
        p.setStyle(Paint.Style.FILL); p.setColor(s.color("hub", 0xFFEB6E57)); c.drawCircle(CX, CY, 3.4f, p);
        c.restore();
        return b;
    }

    /** A thin bar, filled from the start side (right in Hebrew). */
    static Bitmap bar(double f, int color, int track, boolean rtl) {
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

    /** Draws the first `share` (0–1) of the ridges' total length, ridge after ridge from the centre out. */
    private static void fill(Canvas c, Paint p, double share) {
        double total = 0; double[] len = new double[RIDGES.length];
        for (int i = 0; i < RIDGES.length; i++) { len[i] = length(RIDGES[i]); total += len[i]; }
        double left = share * total;
        for (int i = 0; i < RIDGES.length && left > 0; i++) {
            c.drawPath(arc(RIDGES[i], (float) Math.min(1, left / len[i])), p);
            left -= len[i];
        }
    }

    private static void hand(Canvas c, Paint p, double deg, float len, float w) {
        double r = Math.toRadians(deg);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(w);
        c.drawLine(CX, CY, (float) (CX + len * Math.sin(r)), (float) (CY - len * Math.cos(r)), p);
    }

    private static Shader gradient(WidgetState s, String phase) {
        String a = phase.equals("ot1") ? "ot1" : phase.equals("ot2") ? "ot2" : "reg";
        int ca = s.color(a + "a", 0xFF6E98E0), cb = s.color(a + "b", ca);
        return new LinearGradient(0, 100, 100, 0, ca, cb, Shader.TileMode.CLAMP);
    }

    /** Seven elliptic ridges around the core; every other one has a small break. Each: {cx, cy, rx, ry, from°, to°}. */
    private static float[][] ridges() {
        List<float[]> out = new ArrayList<>();
        float step = 6.2f, first = 6.5f;
        for (int i = 0; i < 7; i++) {
            float rx = first + i * step, ry = rx * 1.17f, gap = 28 + i * 2.5f, a0 = 90 + gap, a1 = 450 - gap;
            if (i % 2 == 1) {
                float br = 200 + ((i * 47) % 130), bw = 9;
                out.add(new float[]{CX, CY, rx, ry, a0, br});
                out.add(new float[]{CX, CY, rx, ry, br + bw, a1});
            } else out.add(new float[]{CX, CY, rx, ry, a0, a1});
        }
        return out.toArray(new float[0][]);
    }

    /** The first `f` (0–1) of a ridge, as a path of short lines. */
    private static Path arc(float[] a, float f) {
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

    private static double length(float[] a) {
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
}
