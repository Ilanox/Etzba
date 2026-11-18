package com.edvinstudios.etzba;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Shows the app's scheduled notifications (see NotifyPlugin), and twice a day asks the website whether a
 * feature this person is waiting for has opened to everyone (data/early.json); if so, says so once.
 * After a reboot or an app update, puts everything back (alarms don't survive a reboot).
 */
public class NotifyReceiver extends BroadcastReceiver {
    static final String CHANNEL = "etzba_shift";
    static final String EARLY = "com.edvinstudios.etzba.EARLY_CHECK";

    @Override
    public void onReceive(Context ctx, Intent in) {
        String a = in.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) { rearm(ctx); return; }
        if (EARLY.equals(a)) {
            final PendingResult done = goAsync();
            new Thread(() -> { try { checkEarly(ctx); } finally { done.finish(); } }).start();
            return;
        }
        show(ctx, in.getIntExtra("id", 100), in.getStringExtra("title"), in.getStringExtra("body"));
    }

    static void show(Context ctx, int id, String title, String body) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        if (!nm.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager sys = ctx.getSystemService(NotificationManager.class);
            if (sys.getNotificationChannel(CHANNEL) == null) {
                String name = ctx.getResources().getConfiguration().getLocales().get(0).getLanguage().equals("en") ? "Shift alerts" : "התראות משמרת";
                sys.createNotificationChannel(new NotificationChannel(CHANNEL, name, NotificationManager.IMPORTANCE_DEFAULT));
            }
        }
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open == null) open = new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, 6000, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int icon = ctx.getResources().getIdentifier("ic_stat_etzba", "drawable", ctx.getPackageName());
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_info)
            .setColor(0xFFFF6A3D)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(tap)
            .setAutoCancel(true);
        try { nm.notify(id, b.build()); } catch (SecurityException ignored) { /* permission taken back */ }
    }

    /** Twice a day, roughly (inexact: no special permission). Off when nothing is being waited for. */
    static void armEarly(Context ctx, boolean on) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 6999, new Intent(ctx, NotifyReceiver.class).setAction(EARLY), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        if (on) am.setInexactRepeating(AlarmManager.RTC, System.currentTimeMillis() + AlarmManager.INTERVAL_HOUR, AlarmManager.INTERVAL_HALF_DAY, pi);
    }

    static void rearm(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(NotifyPlugin.PREFS, Context.MODE_PRIVATE);
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            JSONArray items = new JSONArray(p.getString("items", "[]")); long now = System.currentTimeMillis();
            for (int i = 0; i < items.length(); i++) {
                JSONObject x = items.getJSONObject(i);
                if (x.optLong("at") > now) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, x.getLong("at"), NotifyPlugin.pending(ctx, x, PendingIntent.FLAG_UPDATE_CURRENT));
            }
            armEarly(ctx, new JSONArray(p.getString("early", "[]")).length() > 0);
        } catch (Exception ignored) { }
    }

    static void checkEarly(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(NotifyPlugin.PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray wait = new JSONArray(p.getString("early", "[]"));
            if (wait.length() == 0) { armEarly(ctx, false); return; }
            HttpURLConnection c = (HttpURLConnection) new URL(p.getString("early_url", "") + "?t=" + System.currentTimeMillis()).openConnection();
            c.setConnectTimeout(8000); c.setReadTimeout(8000); c.setUseCaches(false);
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) { String l; while ((l = r.readLine()) != null) sb.append(l); }
            JSONObject dates = new JSONObject(sb.toString());
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            JSONArray still = new JSONArray();
            for (int i = 0; i < wait.length(); i++) {
                JSONObject x = wait.getJSONObject(i);
                String d = dates.optString(x.optString("name"), "");
                if (!d.isEmpty() && d.compareTo(today) <= 0) show(ctx, 950 + i, x.optString("title"), x.optString("body"));
                else still.put(x);
            }
            p.edit().putString("early", still.toString()).apply();
            if (still.length() == 0) armEarly(ctx, false);
        } catch (Exception ignored) { /* offline: try again next time */ }
    }
}
