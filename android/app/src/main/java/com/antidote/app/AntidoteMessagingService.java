package com.antidote.app;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.UUID;

public class AntidoteMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        String kind = message.getData().get("antidote_kind");
        if (!"message".equals(kind) && !"voice_reply".equals(kind)) {
            super.onMessageReceived(message);
            return;
        }

        String audience = message.getData().get("audience");
        String activeAudience = getSharedPreferences(AppChromePlugin.PREVIEW_PREFERENCES, 0)
            .getString(AppChromePlugin.PREVIEW_AUDIENCE, null);
        if (audience == null || !audience.equals(activeAudience)) return;

        KeyguardManager keyguard = getSystemService(KeyguardManager.class);
        if (MainActivity.visible && (keyguard == null || !keyguard.isKeyguardLocked())) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || !manager.areNotificationsEnabled()) return;

        boolean isMessage = "message".equals(kind);
        String channel = notificationChannel(manager, isMessage);
        String genericTitle = getString(isMessage ? R.string.new_chat_message : R.string.new_voice_reply);
        String previewTitle = message.getData().get("preview_title");
        Intent openApp = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(this, 0, openApp, PendingIntent.FLAG_IMMUTABLE);
        Notification publicVersion = notification(channel, open)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentTitle(genericTitle)
            .build();
        NotificationCompat.Builder privateVersion = notification(channel, open)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setContentTitle(genericTitle);
        if (previewTitle != null && !previewTitle.trim().isEmpty()) {
            privateVersion.setContentTitle(previewTitle);
        }

        String tag = message.getData().get("notification_id");
        if (tag == null) tag = message.getMessageId();
        manager.notify(tag == null ? UUID.randomUUID().toString() : tag, 0, privateVersion.build());
    }

    private NotificationCompat.Builder notification(String channel, PendingIntent open) {
        return new NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.ic_antidote_notification)
            .setColor(ContextCompat.getColor(this, R.color.ic_launcher_background))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
    }

    private String notificationChannel(NotificationManager manager, boolean isMessage) {
        String oldId = isMessage ? "chat-messages" : "voice-replies";
        String id = oldId + "-private";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(id) == null) {
            NotificationChannel previous = manager.getNotificationChannel(oldId);
            int importance = previous == null ? NotificationManager.IMPORTANCE_DEFAULT : previous.getImportance();
            NotificationChannel channel = new NotificationChannel(
                id, getString(isMessage ? R.string.chat_messages_channel : R.string.voice_replies_channel), importance
            );
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            if (previous != null) {
                channel.setSound(previous.getSound(), previous.getAudioAttributes());
                channel.enableVibration(previous.shouldVibrate());
            }
            manager.createNotificationChannel(channel);
        }
        return id;
    }
}
