package com.edvinstudios.etzba;

import android.content.ComponentName;
import android.content.pm.PackageManager;

import androidx.annotation.NonNull;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Supporting the app: one-time payments through Google Play (in-app products, set up in Play Console).
 * Every product is consumed right after it's paid for, so the same amount can be given again.
 * Nothing in the app is unlocked by paying.
 */
@CapacitorPlugin(name = "Billing")
public class BillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private final Map<String, ProductDetails> details = new HashMap<>();
    private PluginCall buying;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    private interface Then { void run(); }
    private interface Fail { void run(String why); }

    private void ready(Then then, Fail fail) {
        if (client.isReady()) { then.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(@NonNull BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) { consumeLeftovers(); then.run(); }
                else fail.run("setup " + r.getResponseCode() + " " + r.getDebugMessage());
            }
            @Override public void onBillingServiceDisconnected() { }
        });
    }

    /** A payment that went through while the app was closed: finish it now. */
    private void consumeLeftovers() {
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (r, list) -> { for (Purchase p : list) if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) consume(p, null); });
    }

    /** Prices as Google Play shows them in the person's country: { products: [{ id, price, micros }] }. */
    @PluginMethod
    public void products(PluginCall call) {
        JSArray ids = call.getArray("ids");
        ready(() -> {
            List<QueryProductDetailsParams.Product> ps = new ArrayList<>();
            try {
                for (Object id : ids.toList()) ps.add(QueryProductDetailsParams.Product.newBuilder().setProductId(String.valueOf(id)).setProductType(BillingClient.ProductType.INAPP).build());
            } catch (JSONException e) { call.reject("ids"); return; }
            client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(ps).build(), (r, list) -> {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("query " + r.getResponseCode() + " " + r.getDebugMessage()); return; }
                JSArray out = new JSArray();
                for (ProductDetails d : list) {
                    details.put(d.getProductId(), d);
                    ProductDetails.OneTimePurchaseOfferDetails o = d.getOneTimePurchaseOfferDetails();
                    if (o == null) continue;
                    JSObject x = new JSObject();
                    x.put("id", d.getProductId()); x.put("price", o.getFormattedPrice()); x.put("micros", o.getPriceAmountMicros());
                    out.put(x);
                }
                JSObject res = new JSObject(); res.put("products", out); call.resolve(res);
            });
        }, call::reject);
    }

    /** Opens Google Play's payment sheet. Resolves { ok } once paid, { ok: false, cancelled } if the person backs out. */
    @PluginMethod
    public void buy(PluginCall call) {
        String id = call.getString("id", "");
        ready(() -> {
            ProductDetails d = details.get(id);
            if (d == null) { call.reject("unknown product " + id); return; }
            List<BillingFlowParams.ProductDetailsParams> ps = new ArrayList<>();
            ps.add(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build());
            if (buying != null) buying.reject("replaced");
            buying = call; call.setKeepAlive(true);
            BillingResult r = client.launchBillingFlow(getActivity(), BillingFlowParams.newBuilder().setProductDetailsParamsList(ps).build());
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) finish(false, false, "launch " + r.getResponseCode() + " " + r.getDebugMessage());
        }, call::reject);
    }

    /**
     * A supporter's app icon: 'default', 'gold', 'night', 'paper' or 'forest'. Each is an activity-alias in the
     * manifest (scripts/native-setup.mjs); the chosen one is switched on first, so there's always one.
     */
    @PluginMethod
    public void setIcon(PluginCall call) {
        String want = call.getString("name", "default");
        String[] all = { "Default", "Gold", "Night", "Paper", "Forest", "Sunset", "Ocean", "Plum", "Ember", "Sand" };
        PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        try {
            for (String n : all) if (n.equalsIgnoreCase(want))
                pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + ".Icon" + n), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            for (String n : all) if (!n.equalsIgnoreCase(want))
                pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + ".Icon" + n), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            call.resolve();
        } catch (Exception e) { call.reject("icon: " + e.getMessage()); }
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult r, List<Purchase> list) {
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && list != null) {
            boolean paid = false;
            for (Purchase p : list) {
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) { paid = true; consume(p, null); }
            }
            // a pending payment (cash at a store, for example) finishes later; it's consumed then
            finish(paid, false, paid ? null : "pending");
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) finish(false, true, null);
        else finish(false, false, "purchase " + code + " " + r.getDebugMessage());
    }

    private void consume(Purchase p, Then then) {
        client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), (r, token) -> { if (then != null) then.run(); });
    }

    private void finish(boolean ok, boolean cancelled, String why) {
        PluginCall c = buying; buying = null;
        if (c == null) return;
        JSObject res = new JSObject(); res.put("ok", ok); res.put("cancelled", cancelled); if (why != null) res.put("why", why);
        c.setKeepAlive(false);
        c.resolve(res);
    }
}
