package com.antidote.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "AndroidUpdater")
public class AndroidUpdaterPlugin extends Plugin {
    private static final String DOWNLOAD_ROOT =
        "https://github.com/baranaikooo/Antidote.app/releases/download/v1.0.0-alpha/";
    private static final long MAX_BYTES = 64L * 1024 * 1024;
    private final AtomicBoolean downloading = new AtomicBoolean();

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo installed = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            call.resolve(new JSObject()
                .put("code", PackageInfoCompat.getLongVersionCode(installed))
                .put("name", installed.versionName));
        } catch (PackageManager.NameNotFoundException error) {
            call.reject("Installed version unavailable", error);
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        String name = call.getString("name", "");
        int code = call.getInt("code", 0);
        if (code < 1 || !name.matches("[0-9]{1,9}\\.[0-9]{1,9}\\.[0-9]{1,9}")) {
            call.reject("Invalid update version");
            return;
        }
        PackageManager packages = getContext().getPackageManager();
        String packageName = getContext().getPackageName();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packages.canRequestPackageInstalls()) {
            reportProgress("permission", 0, 0);
            Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + packageName));
            getActivity().runOnUiThread(() -> {
                try {
                    startActivityForResult(call, permission, "installPermissionResult");
                } catch (RuntimeException error) {
                    call.reject("Unable to open Android installation settings", error);
                }
            });
            return;
        }

        startDownload(call, name, code);
    }

    @ActivityCallback
    private void installPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.resolve(new JSObject().put("state", "permission"));
            return;
        }
        startDownload(call, call.getString("name", ""), call.getInt("code", 0));
    }

    private void startDownload(PluginCall call, String name, int code) {
        if (!downloading.compareAndSet(false, true)) {
            call.reject("An update is already downloading");
            return;
        }

        new Thread(() -> prepareUpdate(call, name, code), "antidote-update").start();
    }

    private void prepareUpdate(PluginCall call, String name, int code) {
        PackageManager packages = getContext().getPackageManager();
        String packageName = getContext().getPackageName();
        File apk = new File(getContext().getCacheDir(), "antidote-update.apk");
        try {
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;
            PackageInfo installed = packages.getPackageInfo(packageName, flags);
            if (code <= PackageInfoCompat.getLongVersionCode(installed)) throw new IOException("Update is not newer");
            download(new URL(DOWNLOAD_ROOT + "Antidote-" + code + "-" + name + ".apk"), apk);
            reportProgress("verifying", 0, 0);
            PackageInfo update = packages.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
            if (update == null || !packageName.equals(update.packageName) ||
                code != PackageInfoCompat.getLongVersionCode(update) || !name.equals(update.versionName) ||
                !Arrays.equals(signers(installed), signers(update))) {
                throw new IOException("Unexpected update package");
            }

            Uri uri = FileProvider.getUriForFile(getContext(), packageName + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            launch(call, install, "installer");
        } catch (IOException | PackageManager.NameNotFoundException | RuntimeException error) {
            apk.delete();
            call.reject("Unable to prepare the Antidote update", error);
        } finally {
            downloading.set(false);
        }
    }

    private void launch(PluginCall call, Intent intent, String state) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                call.resolve(new JSObject().put("state", state));
            } catch (RuntimeException error) {
                call.reject("Unable to open Android settings or installer", error);
            }
        });
    }

    private static Signature[] signers(PackageInfo info) throws IOException {
        Signature[] signatures = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners())
            : info.signatures;
        if (signatures == null || signatures.length == 0) throw new IOException("Update signature unavailable");
        return signatures;
    }

    private void reportProgress(String stage, long received, long total) {
        JSObject progress = new JSObject().put("stage", stage).put("received", received).put("total", total);
        execute(() -> notifyListeners("downloadProgress", progress));
    }

    private void download(URL url, File target) throws IOException {
        for (int redirects = 0; redirects < 4; redirects++) {
            if (!"https".equals(url.getProtocol()) ||
                (!"github.com".equals(url.getHost()) && !"release-assets.githubusercontent.com".equals(url.getHost()))) {
                throw new IOException("Unexpected update host");
            }
            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(false);
            try {
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("Missing update location");
                    url = new URL(url, location);
                    continue;
                }
                if (status != 200) throw new IOException("Update download failed");
                long expected = Math.max(0, connection.getContentLength());
                if (expected > MAX_BYTES) throw new IOException("Update exceeds the size limit");
                reportProgress("downloading", 0, expected);
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[32768];
                    long total = 0;
                    long lastProgress = SystemClock.elapsedRealtime();
                    for (int read; (read = input.read(buffer)) != -1;) {
                        total += read;
                        if (total > MAX_BYTES) throw new IOException("Update exceeds the size limit");
                        output.write(buffer, 0, read);
                        long now = SystemClock.elapsedRealtime();
                        if (now - lastProgress >= 120 || (expected > 0 && total == expected)) {
                            reportProgress("downloading", total, expected);
                            lastProgress = now;
                        }
                    }
                }
                return;
            } finally {
                connection.disconnect();
            }
        }
        throw new IOException("Too many update redirects");
    }
}
