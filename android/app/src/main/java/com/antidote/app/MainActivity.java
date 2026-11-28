package com.antidote.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    static volatile boolean visible;

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
