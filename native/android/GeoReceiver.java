package com.edvinstudios.etzba;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Woken by the OS (never polling): after staying at a workplace ~3 minutes it asks "at work? clock in",
 * and on leaving during a shift it asks "left work? end the shift". After a reboot or an app update it
 * puts the workplace circles back, since Android forgets them then.
 */
public class GeoReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "geo";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) { register(ctx); return; }

        GeofencingEvent ev = GeofencingEvent.fromIntent(intent);
        if (ev == null || ev.hasError() || ev.getTriggeringGeofences() == null || ev.getTriggeringGeofences().isEmpty()) return;
        String jobId = ev.getTriggeringGeofences().get(0).getRequestId();
        JSONObject job = findJob(ctx, jobId);
        if (job == null) return;
        String name = job.optString("name", "");
        JSONObject t = GeoPlugin.texts(ctx);
        boolean active = GeoPlugin.prefs(ctx).getBoolean("active", false);
        String activeJob = GeoPlugin.prefs(ctx).getString("activeJob", "");

        int tr = ev.getGeofenceTransition();
        if (tr == Geofence.GEOFENCE_TRANSITION_DWELL && !active) {
            notify(ctx, 1, t.optString("inTitle", "הגעת לעבודה?").replace("{job}", name),
                t.optString("inBody", "{job} · להתחיל משמרת עכשיו?").replace("{job}", name),
                t.optString("inAction", "להתחיל משמרת"), "start", jobId);
        } else if (tr == Geofence.GEOFENCE_TRANSITION_EXIT && active && jobId.equals(activeJob)) {
            notify(ctx, 2, t.optString("outTitle", "יצאת מהעבודה?").replace("{job}", name),
                t.optString("outBody", "{job} · המשמרת עדיין רצה. לסיים אותה?").replace("{job}", name),
                t.optString("outAction", "לסיים משמרת"), "end", jobId);
        }
    }

    private static JSONObject findJob(Context ctx, String id) {
        JSONArray f = GeoPlugin.fences(ctx);
        for (int i = 0; i < f.length(); i++) { JSONObject o = f.optJSONObject(i); if (o != null && id.equals(o.optString("id"))) return o; }
        return null;
    }

    private static PendingIntent fencePI(Context ctx) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, 0, new Intent(ctx, GeoReceiver.class), flags);
    }

    /** (Re)registers every workplace circle. Returns false when location "all the time" isn't allowed. */
    @SuppressLint("MissingPermission")
    static boolean register(Context ctx) {
        try { LocationServices.getGeofencingClient(ctx).removeGeofences(fencePI(ctx)); } catch (Exception ignored) { }
        JSONArray f = GeoPlugin.fences(ctx);
        if (f.length() == 0) return true;
        boolean fine = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean bg = Build.VERSION.SDK_INT < 29 || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine || !bg) return false;
        List<Geofence> list = new ArrayList<>();
        for (int i = 0; i < f.length() && i < 90; i++) {
            JSONObject o = f.optJSONObject(i); if (o == null) continue;
            list.add(new Geofence.Builder()
                .setRequestId(o.optString("id"))
                .setCircularRegion(o.optDouble("lat"), o.optDouble("lng"), (float) o.optDouble("radius", 200))
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_DWELL | Geofence.GEOFENCE_TRANSITION_EXIT)
                .setLoiteringDelay(3 * 60 * 1000)              // ignore driving past
                .setNotificationResponsiveness(3 * 60 * 1000)  // a few minutes late is fine, and saves battery
                .build());
        }
        if (list.isEmpty()) return true;
        GeofencingRequest req = new GeofencingRequest.Builder().setInitialTrigger(0).addGeofences(list).build();
        try { LocationServices.getGeofencingClient(ctx).addGeofences(req, fencePI(ctx)); return true; } catch (Exception e) { return false; }
    }

    @SuppressLint("MissingPermission")
    static void notify(Context ctx, int id, String title, String body, String actionLabel, String action, String jobId) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        if (!nm.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, GeoPlugin.texts(ctx).optString("channel", "הגעה ויציאה מהעבודה"), NotificationManager.IMPORTANCE_DEFAULT);
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
        int imm = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        // tapping the notification opens the app and asks; the button does it straight away
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("etzba_token", AppActionsPlugin.token(ctx)).putExtra("etzba_action", "ask_" + action).putExtra("etzba_job", jobId);
        PendingIntent tapOpen = PendingIntent.getActivity(ctx, id * 10, open, PendingIntent.FLAG_UPDATE_CURRENT | imm);
        Intent act = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("etzba_token", AppActionsPlugin.token(ctx)).putExtra("etzba_action", action).putExtra("etzba_job", jobId);
        PendingIntent tapAct = PendingIntent.getActivity(ctx, id * 10 + 1, act, PendingIntent.FLAG_UPDATE_CURRENT | imm);
        int icon = ctx.getResources().getIdentifier("ic_stat_etzba", "drawable", ctx.getPackageName());
        NotificationCompat.Builder n = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(icon != 0 ? icon : ctx.getApplicationInfo().icon)
            .setColor(0xFFFF6A3D)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(tapOpen)
            .addAction(0, actionLabel, tapAct);
        try { nm.notify(id, n.build()); } catch (Exception ignored) { }
    }
}
