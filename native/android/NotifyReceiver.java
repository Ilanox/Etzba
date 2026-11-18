package com.edvinstudios.etzba;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Shows one of the app's scheduled notifications (see NotifyPlugin). Tapping it opens the app. */
public class NotifyReceiver extends BroadcastReceiver {
    static final String CHANNEL = "etzba_shift";

    @Override
    public void onReceive(Context ctx, Intent in) {
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
        if (open == null) { open = new Intent(ctx, MainActivity.class); }
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, 6000, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int icon = ctx.getResources().getIdentifier("ic_stat_etzba", "drawable", ctx.getPackageName());
        String body = in.getStringExtra("body");
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_info)
            .setColor(0xFFFF6A3D)
            .setContentTitle(in.getStringExtra("title"))
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(tap)
            .setAutoCancel(true);
        try { nm.notify(in.getIntExtra("id", 100), b.build()); } catch (SecurityException ignored) { /* permission taken back */ }
    }
}
