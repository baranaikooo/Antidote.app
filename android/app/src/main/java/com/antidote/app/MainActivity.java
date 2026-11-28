package com.antidote.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    static volatile boolean visible;
    private final ActivityResultLauncher<String> notificationPermission = registerForActivityResult(
        new ActivityResultContracts.RequestPermission(),
        granted -> {
            if (!granted) return;
            getSharedPreferences(AppChromePlugin.STARTUP_NOTIFICATION_PREFERENCES, MODE_PRIVATE)
                .edit().putBoolean(AppChromePlugin.STARTUP_NOTIFICATION_PENDING, true).apply();
            PluginHandle handle = getBridge() == null ? null : getBridge().getPlugin("AppChrome");
            if (handle != null && handle.getInstance() instanceof AppChromePlugin chrome) {
                chrome.notifyStartupNotificationGrant();
            }
        }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppChromePlugin.class);
        registerPlugin(AndroidUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        updateSystemBars();
        requestNotificationsAtStartup();
    }

    private void requestNotificationsAtStartup() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (!AppChromePlugin.hasFirebaseConfiguration(this)) return;

        var preferences = getSharedPreferences(AppChromePlugin.STARTUP_NOTIFICATION_PREFERENCES, MODE_PRIVATE);
        if (preferences.getBoolean("prompt_attempted", false)) return;
        preferences.edit().putBoolean("prompt_attempted", true).apply();

        String permission = Manifest.permission.POST_NOTIFICATIONS;
        if (ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
            || shouldShowRequestPermissionRationale(permission)) return;
        notificationPermission.launch(permission);
    }

    @Override
    public void onStart() {
        super.onStart();
        visible = true;
    }

    @Override
    public void onStop() {
        visible = false;
        super.onStop();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) updateSystemBars();
    }

    private void updateSystemBars() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.show(WindowInsetsCompat.Type.systemBars());
    }
}
