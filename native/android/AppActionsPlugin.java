package com.edvinstudios.etzba;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.UUID;

/**
 * Requests that reach the app from outside it (the widget, arrival notifications, the developer unlock link),
 * the device id for the developer unlock, and the data the widget shows.
 */
@CapacitorPlugin(name = "AppActions")
public class AppActionsPlugin extends Plugin {
    static final String PREFS = "etzba_widget";
    private JSObject pending;

    @Override
    public void load() {
        read(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (read(intent)) notifyListeners("action", pending, true);
    }

    /** A random secret made once per install. Our own intents carry it, so other apps can't send actions. */
    static String token(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences("etzba_actions", Context.MODE_PRIVATE);
        String t = p.getString("token", null);
        if (t == null) { t = UUID.randomUUID().toString(); p.edit().putString("token", t).apply(); }
        return t;
    }

    /** Takes the action out of the intent (once) and keeps it for the app to collect. */
    private boolean read(Intent intent) {
        String act = intent != null ? intent.getStringExtra("etzba_action") : null;
        if (act == null) return false;
        // the developer unlock link is checked by its own signature in the app instead
        if (!"dev_unlock".equals(act) && !token(getContext()).equals(intent.getStringExtra("etzba_token"))) {
            intent.removeExtra("etzba_action"); return false;
        }
        JSObject a = new JSObject();
        a.put("action", act);
        a.put("jobId", orEmpty(intent.getStringExtra("etzba_job")));
        a.put("sig", orEmpty(intent.getStringExtra("etzba_sig")));
        pending = a;
        intent.removeExtra("etzba_action"); intent.removeExtra("etzba_sig"); intent.removeExtra("etzba_token");
        // the arrival notifications are done with once acted on
        try { NotificationManagerCompat nm = NotificationManagerCompat.from(getContext()); nm.cancel(1); nm.cancel(2); } catch (Exception ignored) { }
        return true;
    }

    private static String orEmpty(String s) { return s != null ? s : ""; }

    @PluginMethod
    public void deviceId(PluginCall call) {
        JSObject r = new JSObject();
        r.put("id", Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ANDROID_ID));
        call.resolve(r);
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject r = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(r);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** Saves what the widget shows (see WidgetState) and redraws it. */
    @PluginMethod
    public void updateWidget(PluginCall call) {
        try {
            SharedPreferences.Editor e = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            e.putBoolean("active", Boolean.TRUE.equals(call.getBoolean("active", false)));
            e.putLong("start", call.getLong("start", 0L));
            e.putString("job", call.getString("job", ""));
            Double rate = call.getDouble("rate", 0.0);
            e.putLong("rate", Double.doubleToLongBits(rate != null ? rate : 0.0));
            e.putBoolean("rtl", Boolean.TRUE.equals(call.getBoolean("rtl", true)));
            JSArray segs = call.getArray("segs", new JSArray());
            e.putString("segs", segs != null ? segs.toString() : "[]");
            JSObject x = call.getObject("extra", new JSObject());
            e.putString("extra", x != null ? x.toString() : "{}");
            JSObject l = call.getObject("labels", new JSObject());
            e.putString("labels", l != null ? l.toString() : "{}");
            e.apply();
            EtzbaWidget.refresh(getContext());
            call.resolve();
        } catch (Exception ex) {
            call.reject("widget: " + ex.getMessage());
        }
    }
}
