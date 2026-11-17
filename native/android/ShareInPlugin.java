package com.edvinstudios.etzba;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Receives .xls / .xlsx / .csv files shared to אצבע (Share menu) or opened with it ("Open with").
 * The web app calls take() at launch, and listens for "shared" while it is running.
 */
@CapacitorPlugin(name = "ShareIn")
public class ShareInPlugin extends Plugin {
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private JSObject pending;

    @Override
    public void load() {
        handle(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (handle(intent)) notifyListeners("shared", new JSObject(), true);
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject r = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(r);
    }

    @SuppressWarnings("deprecation")
    private boolean handle(Intent intent) {
        if (intent == null) return false;
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        else if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        if (uri == null || !"content".equals(uri.getScheme()) && !"file".equals(uri.getScheme())) return false;
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) return false;
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            int n;
            while ((n = in.read(chunk)) != -1) {
                buf.write(chunk, 0, n);
                if (buf.size() > MAX_BYTES) return false;
            }
            JSObject r = new JSObject();
            r.put("name", nameOf(uri));
            r.put("data", Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP));
            pending = r;
            // handled: don't import the same file again if the activity is recreated
            intent.setAction(Intent.ACTION_MAIN);
            intent.setData(null);
            intent.removeExtra(Intent.EXTRA_STREAM);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String nameOf(Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor c = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception ignored) { }
        }
        if (name == null) name = uri.getLastPathSegment();
        return name != null ? name : "shared.xls";
    }
}
