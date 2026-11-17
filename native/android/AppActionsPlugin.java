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

    private boolean read(Intent intent) {
        if (intent == null || intent.getStringExtra("etzba_action") == null) return false;
        JSObject a = new JSObject();
        a.put("action", intent.getStringExtra("etzba_action"));
        a.put("jobId", intent.getStringExtra("etzba_job") != null ? intent.getStringExtra("etzba_job") : "");
        pending = a;
        intent.removeExtra("etzba_action");
        try { androidx.core.app.NotificationManagerCompat nm = androidx.core.app.NotificationManagerCompat.from(getContext()); nm.cancel(1); nm.cancel(2); } catch (Exception ignored) { }
        return true;
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
