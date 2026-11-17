package com.edvinstudios.etzba;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareInPlugin.class);   // files shared to אצבע from other apps
        super.onCreate(savedInstanceState);
    }
}
