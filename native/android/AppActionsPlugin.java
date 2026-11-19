package com.edvinstudios.etzba;

import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Things outside the app that open it with something to do (the home-screen widget, the arrival and
 * leaving notifications), and keeping the widget up to date with the running shift.
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

    /** A random secret made once per install. Only the app's own widget and notifications know it, so another
        app can't start or end a shift by opening the app with an action. (Developer unlock carries its own signature.) */
    static String token(android.content.Context ctx) {
        android.content.SharedPreferences p = ctx.getSharedPreferences("etzba_actions", android.content.Context.MODE_PRIVATE);
        String t = p.getString("token", null);
        if (t == null) { t = java.util.UUID.randomUUID().toString(); p.edit().putString("token", t).apply(); }
        return t;
    }

    private boolean read(Intent intent) {
        if (intent == null || intent.getStringExtra("etzba_action") == null) return false;
        String act = intent.getStringExtra("etzba_action");
        if (!"dev_unlock".equals(act) && !token(getContext()).equals(intent.getStringExtra("etzba_token"))) {
            intent.removeExtra("etzba_action"); return false;   // not from this app: ignored
        }
        JSObject a = new JSObject();
        a.put("action", intent.getStringExtra("etzba_action"));
        a.put("jobId", intent.getStringExtra("etzba_job") != null ? intent.getStringExtra("etzba_job") : "");
        a.put("sig", intent.getStringExtra("etzba_sig") != null ? intent.getStringExtra("etzba_sig") : "");   // developer mode, from npm run dev-unlock
        pending = a;
        intent.removeExtra("etzba_action"); intent.removeExtra("etzba_sig"); intent.removeExtra("etzba_token");
        try { androidx.core.app.NotificationManagerCompat nm = androidx.core.app.NotificationManagerCompat.from(getContext()); nm.cancel(1); nm.cancel(2); } catch (Exception ignored) { }
        return true;
    }

    /** The phone's Android ID, which developer-mode signatures are made for. */
    @PluginMethod
    public void deviceId(PluginCall call) {
        JSObject r = new JSObject();
        r.put("id", android.provider.Settings.Secure.getString(getContext().getContentResolver(), android.provider.Settings.Secure.ANDROID_ID));
        call.resolve(r);
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject r = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(r);
    }

    /** The app's notification settings, to turn notifications back on. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** { active, start (ms), job, rate, rtl, segs: [[fromMs, perHour], …], labels: {…} } */
    @PluginMethod
    public void updateWidget(PluginCall call) {
        try {
            SharedPreferences.Editor e = getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE).edit();
            e.putBoolean("active", Boolean.TRUE.equals(call.getBoolean("active", false)));
            e.putLong("start", call.getLong("start", 0L));
            e.putString("job", call.getString("job", ""));
            Double rate = call.getDouble("rate", 0.0);
            e.putLong("rate", Double.doubleToLongBits(rate != null ? rate : 0.0));
            e.putBoolean("rtl", Boolean.TRUE.equals(call.getBoolean("rtl", true)));
            com.getcapacitor.JSArray segs = call.getArray("segs", new com.getcapacitor.JSArray());
            e.putString("segs", segs != null ? segs.toString() : "[]");
            JSObject x = call.getObject("extra", new JSObject());
            e.putString("extra", x != null ? x.toString() : "{}");
            JSObject l = call.getObject("labels", new JSObject());
            e.putString("labels", l != null ? l.toString() : "{}");
            e.apply();
            EtzbaWidget.refresh(getContext());
            call.resolve();
        } catch (Exception ex) {
            call.reject("widget: " + ex.getMessage());   // reported to the app's log, never a crash
        }
    }
}
