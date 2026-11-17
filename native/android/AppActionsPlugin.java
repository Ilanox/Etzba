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

    /** { active, start (ms), job, labels: { idle, idleHint, since, starts, end } } */
    @PluginMethod
    public void updateWidget(PluginCall call) {
        SharedPreferences.Editor e = getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE).edit();
        e.putBoolean("active", Boolean.TRUE.equals(call.getBoolean("active", false)));
        e.putLong("start", call.getLong("start", 0L));
        e.putString("job", call.getString("job", ""));
        JSObject l = call.getObject("labels", new JSObject());
        e.putString("labels", l.toString());
        e.apply();
        EtzbaWidget.refresh(getContext());
        call.resolve();
    }
}
