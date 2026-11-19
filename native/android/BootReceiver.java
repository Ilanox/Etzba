package com.edvinstudios.etzba;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After a restart or an app update, puts the scheduled notifications back. The only receiver open to the
    system's broadcasts; it reacts to these two and nothing else (NotifyReceiver itself is private). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent in) {
        String a = in.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) NotifyReceiver.rearm(ctx);
    }
}
