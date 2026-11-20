package com.edvinstudios.etzba;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Address;
import android.location.Geocoder;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.Locale;

@CapacitorPlugin(
    name = "Geo",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
        @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION })
    }
)
public class GeoPlugin extends Plugin {
    static final String PREFS = "etzba_geo";
    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("location", getPermissionState("location") == PermissionState.GRANTED);
        r.put("background", Build.VERSION.SDK_INT < 29 || getPermissionState("background") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void requestLocation(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) { status(call); return; }
        requestPermissionForAlias("location", call, "afterPermission");
    }

    @PluginMethod
    public void requestBackground(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29 || getPermissionState("background") == PermissionState.GRANTED) { status(call); return; }
        requestPermissionForAlias("background", call, "afterPermission");
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        status(call);
    }

    /* ---- one location fix, for "I'm at work now" ---- */
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void current(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) { call.reject("no-permission"); return; }
        LocationServices.getFusedLocationProviderClient(getContext())
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, new CancellationTokenSource().getToken())
            .addOnSuccessListener(loc -> {
                if (loc == null) { call.reject("no-fix"); return; }
                JSObject r = new JSObject();
                r.put("lat", loc.getLatitude());
                r.put("lng", loc.getLongitude());
                r.put("accuracy", loc.getAccuracy());
                call.resolve(r);
            })
            .addOnFailureListener(e -> call.reject("no-fix"));
    }

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void geocode(PluginCall call) {
        String q = call.getString("address", "");
        new Thread(() -> {
            try {
                if (!Geocoder.isPresent()) { call.reject("unavailable"); return; }
                List<Address> list = new Geocoder(getContext(), new Locale("he", "IL")).getFromLocationName(q, 5);
                JSArray out = new JSArray();
                if (list != null) for (Address a : list) {
                    JSObject o = new JSObject();
                    o.put("lat", a.getLatitude());
                    o.put("lng", a.getLongitude());
                    StringBuilder label = new StringBuilder();
                    for (int i = 0; i <= a.getMaxAddressLineIndex(); i++) { if (i > 0) label.append(", "); label.append(a.getAddressLine(i)); }
                    o.put("label", label.toString());
                    out.put(o);
                }
                JSObject r = new JSObject();
                r.put("results", out);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("failed");
            }
        }).start();
    }

    @PluginMethod
    public void setFences(PluginCall call) {
        JSArray fences = call.getArray("fences", new JSArray());
        JSObject texts = call.getObject("texts", new JSObject());
        prefs(getContext()).edit().putString("fences", fences.toString()).putString("texts", texts.toString()).apply();
        boolean ok = GeoReceiver.register(getContext());
        JSObject r = new JSObject();
        r.put("registered", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void setActive(PluginCall call) {
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        prefs(getContext()).edit().putBoolean("active", active).putString("activeJob", call.getString("jobId", "")).apply();
        try { NotificationManagerCompat.from(getContext()).cancel(active ? 1 : 2); } catch (Exception ignored) { }
        call.resolve();
    }

    static void clearNotifications(Context c) {
        try { NotificationManagerCompat nm = NotificationManagerCompat.from(c); nm.cancel(1); nm.cancel(2); } catch (Exception ignored) { }
    }

    @PluginMethod
    public void test(PluginCall call) {
        String kind = call.getString("kind", "in"), jobId = call.getString("jobId", ""), name = call.getString("name", "");
        JSONObject t = texts(getContext());
        if ("out".equals(kind)) GeoReceiver.notify(getContext(), 2, t.optString("outTitle", "").replace("{job}", name), t.optString("outBody", "").replace("{job}", name), t.optString("outAction", ""), "end", jobId);
        else GeoReceiver.notify(getContext(), 1, t.optString("inTitle", "").replace("{job}", name), t.optString("inBody", "").replace("{job}", name), t.optString("inAction", ""), "start", jobId);
        call.resolve();
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONArray fences(Context c) {
        try { return new JSONArray(prefs(c).getString("fences", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static JSONObject texts(Context c) {
        try { return new JSONObject(prefs(c).getString("texts", "{}")); } catch (Exception e) { return new JSONObject(); }
    }
}
