package com.antidote.app;

import android.content.Context;
import android.content.res.Configuration;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.UUID;

@CapacitorPlugin(name = "AppChrome")
public class AppChromePlugin extends Plugin {
    static final String PREVIEW_PREFERENCES = "antidote_notification_previews";
    static final String PREVIEW_AUDIENCE = "audience";
    static final String STARTUP_NOTIFICATION_PREFERENCES = "antidote_startup_notifications";
    static final String STARTUP_NOTIFICATION_PENDING = "grant_pending";

    static boolean hasFirebaseConfiguration(Context context) {
        return context.getResources().getIdentifier("google_app_id", "string", context.getPackageName()) != 0;
    }

    @PluginMethod
    public void hasFirebaseMessaging(PluginCall call) {
        call.resolve(new JSObject()
            .put("available", hasFirebaseConfiguration(getContext()))
            .put("supportsPrivatePreview", true)
            .put("supportsChannels", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O));
    }

    @PluginMethod
    public void readStartupNotificationGrant(PluginCall call) {
        boolean pending = getContext().getSharedPreferences(STARTUP_NOTIFICATION_PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean(STARTUP_NOTIFICATION_PENDING, false);
        call.resolve(new JSObject().put("pending", pending));
    }

    @PluginMethod
    public void consumeStartupNotificationGrant(PluginCall call) {
        getContext().getSharedPreferences(STARTUP_NOTIFICATION_PREFERENCES, Context.MODE_PRIVATE)
            .edit().remove(STARTUP_NOTIFICATION_PENDING).apply();
        call.resolve();
    }

    void notifyStartupNotificationGrant() {
        notifyListeners("startupNotificationGrant", new JSObject(), true);
    }

    @PluginMethod
    public void prepareNotificationPreview(PluginCall call) {
        String owner = call.getString("userId");
        if (owner == null) {
            call.reject("Account required");
            return;
        }
        SharedPreferences preferences = getContext().getSharedPreferences(PREVIEW_PREFERENCES, 0);
        String audience = preferences.getString(PREVIEW_AUDIENCE, null);
        if (!owner.equals(preferences.getString("owner", null)) || audience == null) {
            audience = UUID.randomUUID().toString();
            preferences.edit().putString("owner", owner).putString(PREVIEW_AUDIENCE, audience).apply();
        }
        call.resolve(new JSObject().put("audience", audience));
    }

    @PluginMethod
    public void clearNotificationPreview(PluginCall call) {
        getContext().getSharedPreferences(PREVIEW_PREFERENCES, 0).edit().clear().apply();
        call.resolve();
    }

    @Override
    public void load() {
        int nightMode = getContext().getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        getActivity().runOnUiThread(() -> applyTheme(nightMode == Configuration.UI_MODE_NIGHT_YES));
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark"));
        getActivity().runOnUiThread(() -> {
            applyTheme(dark);
            call.resolve();
        });
    }

    private void applyTheme(boolean dark) {
        // Match Antidote's warm light and deep indigo-plum page backgrounds.
        int color = dark ? 0xff131624 : 0xfff7f2ea;
        Window window = getActivity().getWindow();
        window.getDecorView().setBackgroundColor(color);
        View webView = getBridge().getWebView();
        if (webView.getParent() instanceof View container) {
            container.setBackgroundColor(color);
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            window.setStatusBarColor(color);
            window.setNavigationBarColor(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? color : Color.BLACK);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }
}
