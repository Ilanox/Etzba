package com.edvinstudios.etzba;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

/** Intents that bring the app to the front, shared by the widget and the arrival notifications. */
final class Launch {
    /** Flags for every PendingIntent that opens the app or wakes a receiver. */
    static final int FLAGS = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

    private Launch() { }

    /** Opens the app as it is. */
    static Intent open(Context ctx) {
        return new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    }

    /** Opens the app and asks it to do something ("toggle", "in", "out"…). The token proves the request came from the app itself. */
    static Intent action(Context ctx, String action) {
        return open(ctx).putExtra("etzba_token", AppActionsPlugin.token(ctx)).putExtra("etzba_action", action);
    }
}
