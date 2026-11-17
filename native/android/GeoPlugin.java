package com.edvinstudios.etzba;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Address;
import android.location.Geocoder;
import android.os.Build;

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

/**
 * Workplace arrival / departure, battery-friendly: the phone's own geofencing (Google Play services)
 * watches the workplace circles, so the app does no tracking and isn't running. The OS wakes
 * GeoReceiver only when you've stayed at work for a few minutes, or left it.
 */
@CapacitorPlugin(
    name = "Geo",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
        @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION })
    }
)
public class GeoPlugin extends Plugin {
    static final String PREFS = "etzba_geo";
    private JSObject pendingAction;

    @Override
    public void load() {
        readAction(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (readAction(intent)) notifyListeners("action", pendingAction, true);
    }

    /** A tap on an arrival/departure notification opens the app with what to do. */
    private boolean readAction(Intent intent) {
        if (intent == null || intent.getStringExtra("etzba_action") == null) return false;
        JSObject a = new JSObject();
        a.put("action", intent.getStringExtra("etzba_action"));
        a.put("jobId", intent.getStringExtra("etzba_job"));
        pendingAction = a;
        intent.removeExtra("etzba_action");
        return true;
    }

    @PluginMethod
    public void takeAction(PluginCall call) {
        JSObject r = pendingAction != null ? pendingAction : new JSObject();
        pendingAction = null;
        call.resolve(r);
    }

    /* ---- permissions: "while using" first, then "all the time" (needed for geofences) ---- */
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

    /* ---- address → coordinates, with the phone's own geocoder (needs internet once, no API key) ---- */
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

    /* ---- the workplace circles and the texts to show (the app passes them in its language) ---- */
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

    /** Whether a shift is running (and for which job), so arrival and departure ask the right question. */
    @PluginMethod
    public void setActive(PluginCall call) {
        prefs(getContext()).edit().putBoolean("active", Boolean.TRUE.equals(call.getBoolean("active", false)))
            .putString("activeJob", call.getString("jobId", "")).apply();
        call.resolve();
    }

    /** Developer tools: show the arrival or departure notification for a job right now. */
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
