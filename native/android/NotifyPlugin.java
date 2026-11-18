package com.edvinstudios.etzba;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The app's own scheduled notifications (overtime starting, Shabbat, "still on shift?", planned shifts).
 * Plain AlarmManager.setAndAllowWhileIdle: no exact-alarm permission, never opens any system settings.
 * They arrive on time or a minute or two late. Showing them is NotifyReceiver.
 */
@CapacitorPlugin(name = "Notify")
public class NotifyPlugin extends Plugin {
    static final String PREFS = "etzba_notify";

    /** Replaces everything scheduled with items: [{ id, at (ms), title, body }]. */
    @PluginMethod
    public void schedule(PluginCall call) {
        Context ctx = getContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            // cancel the previous set
            JSONArray old = new JSONArray(p.getString("items", "[]"));
            for (int i = 0; i < old.length(); i++) am.cancel(pending(ctx, old.getJSONObject(i), PendingIntent.FLAG_UPDATE_CURRENT));
            JSArray items = call.getArray("items", new JSArray());
            JSONArray kept = new JSONArray();
            long now = System.currentTimeMillis();
            for (int i = 0; i < items.length(); i++) {
                JSONObject x = items.getJSONObject(i);
                if (x.optLong("at") <= now) continue;
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, x.getLong("at"), pending(ctx, x, PendingIntent.FLAG_UPDATE_CURRENT));
                kept.put(x);
            }
            p.edit().putString("items", kept.toString()).apply();
            JSObject r = new JSObject(); r.put("count", kept.length()); call.resolve(r);
        } catch (Exception e) { call.reject("schedule: " + e.getMessage()); }
    }

    /** What's waiting: { items: [...] } (for the developer tools). */
    @PluginMethod
    public void pending(PluginCall call) {
        try {
            JSONArray a = new JSONArray(getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("items", "[]"));
            JSONArray out = new JSONArray(); long now = System.currentTimeMillis();
            for (int i = 0; i < a.length(); i++) if (a.getJSONObject(i).optLong("at") > now) out.put(a.getJSONObject(i));
            JSObject r = new JSObject(); r.put("items", out); call.resolve(r);
        } catch (Exception e) { call.reject("pending: " + e.getMessage()); }
    }

    /** Features this person is waiting for: items [{ name, title, body }], checked on the website twice a day. */
    @PluginMethod
    public void watchEarly(PluginCall call) {
        try {
            JSArray items = call.getArray("items", new JSArray());
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("early", items.toString()).putString("early_url", call.getString("url", "")).apply();
            NotifyReceiver.armEarly(getContext(), items.length() > 0);
            call.resolve();
        } catch (Exception e) { call.reject("watchEarly: " + e.getMessage()); }
    }

    static PendingIntent pending(Context ctx, JSONObject x, int flag) {
        Intent i = new Intent(ctx, NotifyReceiver.class);
        i.putExtra("id", x.optInt("id")); i.putExtra("title", x.optString("title")); i.putExtra("body", x.optString("body"));
        return PendingIntent.getBroadcast(ctx, 7000 + x.optInt("id"), i, flag | PendingIntent.FLAG_IMMUTABLE);
    }
}
