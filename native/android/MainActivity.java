package com.edvinstudios.etzba;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareInPlugin.class);   // files shared to אצבע from other apps
        registerPlugin(GeoPlugin.class);       // arriving at / leaving work
        super.onCreate(savedInstanceState);
    }
}
