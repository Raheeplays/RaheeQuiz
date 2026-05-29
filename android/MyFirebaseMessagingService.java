package RaheeQuiz.in;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * FILE TYPE: JAVA SERVICE FILE
 * 
 * DIRECTORY PATH (MANDATORY):
 * Save this file inside your Android source folder under the package hierarchy:
 * app/src/main/java/RaheeQuiz/in/MyFirebaseMessagingService.java
 *
 * DESCRIPTION:
 * This class handles background FCM push notifications from the server.
 * All messages are sent as high-priority data messages from our server to ensure 
 * that this service is invoked even if the app is fully closed or killed.
 * It builds custom, beautiful interactive notifications and triggers local notifications with sound.
 */
public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String CHANNEL_ID = "match_challenges_channel";
    private static final String CHANNEL_NAME = "Match Challenges";

    @Override
    public void onCreate() {
        super.onCreate();
        // 1. Auto-subscribe the device to the broadcast "all_users" topic for scalable admin messages
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("all_users")
                .addOnCompleteListener(new com.google.android.gms.tasks.OnCompleteListener<Void>() {
                    @Override
                    public void onComplete(com.google.android.gms.tasks.Task<Void> task) {
                        if (task.isSuccessful()) {
                            android.util.Log.d("FCM", "Service onCreate: Subscribed successfully to all_users topic");
                        } else {
                            android.util.Log.e("FCM", "Service onCreate: Subscription to all_users failed", task.getException());
                        }
                    }
                });
        } catch (Exception e) {
            android.util.Log.e("FCM", "Error subscribing to all_users in onCreate", e);
        }

        // 2. Fetch the current token and register it into RTDB anonymously under publicFcmTokens
        registerDeviceTokenToDatabase();
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        android.util.Log.d("FCM", "onNewToken: " + token);

        // Auto-subscribe brand-new generated session token to general topic broadcast
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("all_users")
                .addOnCompleteListener(new com.google.android.gms.tasks.OnCompleteListener<Void>() {
                    @Override
                    public void onComplete(com.google.android.gms.tasks.Task<Void> task) {
                        if (task.isSuccessful()) {
                            android.util.Log.d("FCM", "Service onNewToken: Subscribed successfully to all_users topic");
                        }
                    }
                });
        } catch (Exception e) {
            android.util.Log.e("FCM", "Error subscribing to all_users in onNewToken", e);
        }

        if (token != null && !token.trim().isEmpty()) {
            sendTokenToRTDB(token);
        }
    }

    private void registerDeviceTokenToDatabase() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String token = null;
                    try {
                        token = com.google.firebase.iid.FirebaseInstanceId.getInstance().getToken();
                    } catch (Throwable e) {
                        android.util.Log.w("FCM", "FirebaseInstanceId.getInstance().getToken() call failed, trying alternative...", e);
                    }

                    if (token != null && !token.trim().isEmpty()) {
                        sendTokenToRTDB(token);
                    } else {
                        android.util.Log.w("FCM", "No registration token fetched (token is null or empty) in service");
                    }
                } catch (Exception e) {
                    android.util.Log.e("FCM", "Exception during token registration step", e);
                }
            }
        }).start();
    }

    private void sendTokenToRTDB(final String token) {
        // Sanitize token to create a path safe key removing invalid database characters
        final String sanitizedToken = token.replaceAll("[.$#\\[\\]/]", "_");
        final String rtdbUrl = "https://raheequiz-default-rtdb.firebaseio.com/publicFcmTokens/" + sanitizedToken + ".json";
        final String payload = "{\"token\":\"" + token + "\",\"timestamp\":" + System.currentTimeMillis() + "}";
        
        new Thread(new Runnable() {
            @Override
            public void run() {
                java.net.HttpURLConnection conn = null;
                try {
                    java.net.URL url = new java.net.URL(rtdbUrl);
                    conn = (java.net.HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("PUT");
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                    conn.setDoOutput(true);
                    
                    java.io.OutputStream os = conn.getOutputStream();
                    byte[] input = payload.getBytes("utf-8");
                    os.write(input, 0, input.length);
                    os.close();
                    
                    int responseCode = conn.getResponseCode();
                    android.util.Log.d("FCM_Service", "Device Token registered to publicFcmTokens. Code: " + responseCode);
                } catch (Exception e) {
                    android.util.Log.e("FCM_Service", "Failed forwarding token to RTDB endpoint", e);
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }
        }).start();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        // Check if message contains a custom data payload
        if (remoteMessage.getData().size() > 0) {
            Map<String, String> data = remoteMessage.getData();
            String actionType = data.get("action_type");
            
            if ("challenge".equals(actionType)) {
                String roomId = data.get("roomId");
                String hostName = data.get("hostName");
                String hostId = data.get("hostId");
                String targetUserId = data.get("targetUserId");
                String targetUserName = data.get("targetUserName");
                
                sendChallengeNotification(hostName, roomId, hostId, targetUserId, targetUserName);
            } else if ("friend_request".equals(actionType)) {
                String senderId = data.get("senderId");
                String senderName = data.get("senderName");
                String targetUserId = data.get("targetUserId");
                String targetUserName = data.get("targetUserName");
                
                sendFriendRequestNotification(senderName, senderId, targetUserId, targetUserName);
            } else if ("reply_accepted".equals(actionType)) {
                String roomId = data.get("roomId");
                String opponentName = data.get("opponentName");
                String opponentId = data.get("opponentId");
                
                sendReplyAcceptedNotification(opponentName, roomId, opponentId);
            } else if ("reply_rejected".equals(actionType)) {
                String roomId = data.get("roomId");
                String opponentName = data.get("opponentName");
                String opponentId = data.get("opponentId");
                
                sendReplyRejectedNotification(opponentName, roomId, opponentId);
            } else if ("exam_register".equals(actionType)) {
                String title = data.containsKey("title") ? data.get("title") : "Exam Registration Open";
                String body = data.containsKey("body") ? data.get("body") : "Register now for the exam slot!";
                String examId = data.get("examId");
                String targetUserId = data.get("targetUserId");
                String targetUserName = data.get("targetUserName");
                sendExamRegisterTimerNotification(title, body, examId, targetUserId, targetUserName);
            } else if ("exam_started".equals(actionType)) {
                String title = data.containsKey("title") ? data.get("title") : "Exam Started!";
                String body = data.containsKey("body") ? data.get("body") : "Click here to begin the exam slot.";
                String examId = data.get("examId");
                String targetUserId = data.get("targetUserId");
                String targetUserName = data.get("targetUserName");
                sendExamStartedNotification(title, body, examId, targetUserId, targetUserName);
            } else if ("countdown".equals(actionType)) {
                String secondsStr = data.get("durationSeconds");
                int secs = 60;
                if (secondsStr != null) {
                    try {
                        secs = Integer.parseInt(secondsStr);
                    } catch (NumberFormatException e) {
                        secs = 60;
                    }
                }
                String title = data.containsKey("title") ? data.get("title") : "Exam Countdown";
                String body = data.containsKey("body") ? data.get("body") : "The exam will start soon";
                sendCountdownNotification(title, body, secs);
            } else if ("textbox_reply".equals(actionType)) {
                String title = data.containsKey("title") ? data.get("title") : "Interactive Poll";
                String body = data.containsKey("body") ? data.get("body") : "Type your feedback below";
                sendTextboxReplyNotification(title, body);
            } else {
                // Attempt to read from notification block first
                String title = remoteMessage.getNotification() != null ? remoteMessage.getNotification().getTitle() : null;
                String body = remoteMessage.getNotification() != null ? remoteMessage.getNotification().getBody() : null;
                String imageUrl = null;
                
                if (remoteMessage.getNotification() != null && remoteMessage.getNotification().getImageUrl() != null) {
                    imageUrl = remoteMessage.getNotification().getImageUrl().toString();
                }
                
                // Fallback: If payload is data-only (which we enforce), read title & body directly from custom data map
                if (title == null || title.isEmpty()) {
                    title = data.containsKey("title") ? data.get("title") : "Match Update";
                }
                if (body == null || body.isEmpty()) {
                    body = data.containsKey("body") ? data.get("body") : "You have a new match update.";
                }
                if (imageUrl == null || imageUrl.isEmpty()) {
                    imageUrl = data.containsKey("image") ? data.get("image") : null;
                }
                if (imageUrl == null || imageUrl.isEmpty()) {
                    imageUrl = data.containsKey("imageUrl") ? data.get("imageUrl") : null;
                }
                
                sendRegularNotification(title, body, imageUrl);
            }
        } else if (remoteMessage.getNotification() != null) {
            // Standard notification message without data payload
            String title = remoteMessage.getNotification().getTitle();
            String body = remoteMessage.getNotification().getBody();
            String imageUrl = null;
            if (remoteMessage.getNotification().getImageUrl() != null) {
                imageUrl = remoteMessage.getNotification().getImageUrl().toString();
            }
            sendRegularNotification(title, body, imageUrl);
        }
    }

    private int getAppIconResourceId() {
        int iconId = 0;
        try {
            iconId = getResources().getIdentifier("icon", "drawable", getPackageName());
        } catch (Exception e) {}
        
        if (iconId == 0) {
            try {
                iconId = getApplicationInfo().icon;
            } catch (Exception e) {}
        }
        
        if (iconId == 0) {
            try {
                iconId = getResources().getIdentifier("ic_launcher", "mipmap", getPackageName());
            } catch (Exception e) {}
        }
        if (iconId == 0) {
            try {
                iconId = getResources().getIdentifier("ic_launcher", "drawable", getPackageName());
            } catch (Exception e) {}
        }
        if (iconId == 0) {
            iconId = android.R.drawable.ic_dialog_info;
        }
        return iconId;
    }

    private void sendFriendRequestNotification(String senderName, String senderId, String targetUserId, String targetUserName) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        int notificationId = (int) System.currentTimeMillis();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Incoming friend request alerts");
            channel.enableLights(true);
            channel.enableVibration(true);
            notificationManager.createNotificationChannel(channel);
        }

        // 1. Intent for accepting friend request
        Intent acceptIntent = new Intent(this, ChallengeActionReceiver.class);
        acceptIntent.setAction("RaheeQuiz.in.ACTION_ACCEPT_FRIEND");
        acceptIntent.putExtra("senderId", senderId);
        acceptIntent.putExtra("senderName", senderName);
        acceptIntent.putExtra("targetUserId", targetUserId);
        acceptIntent.putExtra("targetUserName", targetUserName);
        acceptIntent.putExtra("notificationId", notificationId);

        PendingIntent acceptPendingIntent = PendingIntent.getBroadcast(
                this,
                notificationId + 20,
                acceptIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 2. Intent for rejecting friend request
        Intent rejectIntent = new Intent(this, ChallengeActionReceiver.class);
        rejectIntent.setAction("RaheeQuiz.in.ACTION_REJECT_FRIEND");
        rejectIntent.putExtra("senderId", senderId);
        rejectIntent.putExtra("senderName", senderName);
        rejectIntent.putExtra("targetUserId", targetUserId);
        rejectIntent.putExtra("targetUserName", targetUserName);
        rejectIntent.putExtra("notificationId", notificationId);

        PendingIntent rejectPendingIntent = PendingIntent.getBroadcast(
                this,
                notificationId + 21,
                rejectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(getAppIconResourceId())
                .setContentTitle("New Friend Request")
                .setContentText(senderName + " wants to be your friend!")
                .setAutoCancel(true)
                .setSound(defaultSoundUri)
                .setPriority(NotificationCompat.PRIORITY_MAX);

        // Standard tap intent opens MainActivity
        Intent openIntent = null;
        try {
            openIntent = new Intent(this, Class.forName("RaheeQuiz.in.MainActivity"));
            openIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        } catch (ClassNotFoundException e) {
            openIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (openIntent != null) {
                openIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            }
        }
        if (openIntent != null) {
            PendingIntent openPendingIntent = PendingIntent.getActivity(
                    this,
                    notificationId,
                    openIntent,
                    PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
            );
            notificationBuilder.setContentIntent(openPendingIntent);
        }

        notificationBuilder.addAction(android.R.drawable.ic_menu_add, "ACCEPT", acceptPendingIntent);
        notificationBuilder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "REJECT", rejectPendingIntent);

        notificationManager.notify(notificationId, notificationBuilder.build());
    }

    private void sendChallengeNotification(String hostName, String roomId, String hostId, String targetUserId, String targetUserName) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        int notificationId = (int) System.currentTimeMillis();

        // Register Notification Channel for modern Android (API 26+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Incoming multiplayer match challenges");
            channel.enableLights(true);
            channel.enableVibration(true);
            notificationManager.createNotificationChannel(channel);
        }

        // 1. Intent for touching the main notification banner (opens the app)
        Intent openIntent = null;
        try {
            openIntent = new Intent(this, Class.forName("RaheeQuiz.in.MainActivity"));
            openIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            openIntent.putExtra("roomId", roomId);
            openIntent.putExtra("hostId", hostId);
            openIntent.putExtra("targetUserId", targetUserId);
            openIntent.putExtra("targetUserName", targetUserName);
            openIntent.putExtra("action_type", "open");
        } catch (ClassNotFoundException e) {
            openIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (openIntent != null) {
                openIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                openIntent.putExtra("roomId", roomId);
                openIntent.putExtra("hostId", hostId);
                openIntent.putExtra("targetUserId", targetUserId);
                openIntent.putExtra("targetUserName", targetUserName);
                openIntent.putExtra("action_type", "open");
            }
        }

        PendingIntent openPendingIntent = null;
        if (openIntent != null) {
            openPendingIntent = PendingIntent.getActivity(
                    this, 
                    notificationId, 
                    openIntent, 
                    PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        // 2. Intent for clicking the "ACCEPT" button - goes to Broadcaster Receiver
        Intent acceptIntent = new Intent(this, ChallengeActionReceiver.class);
        acceptIntent.setAction("RaheeQuiz.in.ACTION_ACCEPT");
        acceptIntent.putExtra("roomId", roomId);
        acceptIntent.putExtra("hostId", hostId);
        acceptIntent.putExtra("targetUserId", targetUserId);
        acceptIntent.putExtra("targetUserName", targetUserName);
        acceptIntent.putExtra("notificationId", notificationId);
        
        PendingIntent acceptPendingIntent = PendingIntent.getBroadcast(
                this, 
                notificationId + 1, 
                acceptIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 3. Intent for clicking the "REJECT" button - goes to Broadcaster Receiver
        Intent rejectIntent = new Intent(this, ChallengeActionReceiver.class);
        rejectIntent.setAction("RaheeQuiz.in.ACTION_REJECT");
        rejectIntent.putExtra("roomId", roomId);
        rejectIntent.putExtra("hostId", hostId);
        rejectIntent.putExtra("targetUserId", targetUserId);
        rejectIntent.putExtra("targetUserName", targetUserName);
        rejectIntent.putExtra("notificationId", notificationId);
        
        PendingIntent rejectPendingIntent = PendingIntent.getBroadcast(
                this, 
                notificationId + 2, 
                rejectIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        // Build notification with high visual priority and dynamic CTA buttons
        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(getAppIconResourceId()) // Use app's launcher icon!
                .setContentTitle("New Challenge!")
                .setContentText(hostName + " challenged you to play a match")
                .setAutoCancel(true)
                .setSound(defaultSoundUri)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE);

        if (openPendingIntent != null) {
            notificationBuilder.setContentIntent(openPendingIntent);
        }

        // Add the styled CTA actions
        notificationBuilder.addAction(android.R.drawable.ic_media_play, "ACCEPT", acceptPendingIntent);
        notificationBuilder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "REJECT", rejectPendingIntent);

        notificationManager.notify(notificationId, notificationBuilder.build());
    }

    private void sendReplyAcceptedNotification(String opponentName, String roomId, String opponentId) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        int notificationId = (int) System.currentTimeMillis();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.enableLights(true);
            channel.enableVibration(true);
            notificationManager.createNotificationChannel(channel);
        }

        // Tapping PLAY NOW through Broadcast Receiver so it is cleared/dismissed from panel, and then launches App
        Intent playIntent = new Intent(this, ChallengeActionReceiver.class);
        playIntent.setAction("RaheeQuiz.in.ACTION_PLAY_NOW");
        playIntent.putExtra("roomId", roomId);
        playIntent.putExtra("opponentId", opponentId);
        playIntent.putExtra("notificationId", notificationId);

        PendingIntent playPendingIntent = PendingIntent.getBroadcast(
                this, 
                notificationId + 520, 
                playIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(getAppIconResourceId()) // Use app's launcher icon!
                .setContentTitle("Match Ready!")
                .setContentText(opponentName + " accepted your challenge!")
                .setAutoCancel(true)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
                .setPriority(NotificationCompat.PRIORITY_MAX);

        // General tap intent can also open MainActivity directly as a fallback
        Intent openIntent = null;
        try {
            openIntent = new Intent(this, Class.forName("RaheeQuiz.in.MainActivity"));
            openIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            openIntent.putExtra("roomId", roomId);
            openIntent.putExtra("opponentId", opponentId);
            openIntent.putExtra("action_type", "play_now");
        } catch (ClassNotFoundException e) {
            openIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        }
        if (openIntent != null) {
            PendingIntent openPendingIntent = PendingIntent.getActivity(
                    this,
                    notificationId,
                    openIntent,
                    PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
            );
            notificationBuilder.setContentIntent(openPendingIntent);
        }

        notificationBuilder.addAction(android.R.drawable.ic_media_play, "PLAY NOW", playPendingIntent);

        notificationManager.notify(notificationId, notificationBuilder.build());
    }

    private void sendReplyRejectedNotification(String opponentName, String roomId, String opponentId) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        int notificationId = (int) System.currentTimeMillis();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.enableLights(true);
            channel.enableVibration(true);
            notificationManager.createNotificationChannel(channel);
        }

        // Tapping CHALLENGE AGAIN through Broadcast Receiver so it's dismissed, sends background challenge via RTDB, and does NOT open/launch the app!
        Intent challengeAgainIntent = new Intent(this, ChallengeActionReceiver.class);
        challengeAgainIntent.setAction("RaheeQuiz.in.ACTION_CHALLENGE_AGAIN");
        challengeAgainIntent.putExtra("roomId", roomId);
        challengeAgainIntent.putExtra("opponentId", opponentId);
        challengeAgainIntent.putExtra("opponentName", opponentName);
        challengeAgainIntent.putExtra("notificationId", notificationId);

        PendingIntent challengeAgainPendingIntent = PendingIntent.getBroadcast(
                this, 
                notificationId + 521, 
                challengeAgainIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(getAppIconResourceId()) // Use app's launcher icon!
                .setContentTitle("Challenge Rejected")
                .setContentText(opponentName + " declined your match challenge.")
                .setAutoCancel(true)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
                .setPriority(NotificationCompat.PRIORITY_MAX);

        notificationBuilder.addAction(android.R.drawable.stat_notify_missed_call, "CHALLENGE AGAIN", challengeAgainPendingIntent);

        notificationManager.notify(notificationId, notificationBuilder.build());
    }

    private void sendExamRegisterTimerNotification(String title, String body, String examId, String targetUserId, String targetUserName) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        int notificationId = (int) System.currentTimeMillis();
        String channelId = "countdown_notification_channel";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId, 
                    "Countdown Alerts", 
                    NotificationManager.IMPORTANCE_HIGH
            );
            notificationManager.createNotificationChannel(channel);
        }

        // REGISTER NOW Action -> goes to Receiver background and does NOT launch/open app
        Intent registerIntent = new Intent(this, ChallengeActionReceiver.class);
        registerIntent.setAction("RaheeQuiz.in.ACTION_REGISTER_NOW");
        registerIntent.putExtra("examId", examId);
        registerIntent.putExtra("targetUserId", targetUserId);
        registerIntent.putExtra("targetUserName", targetUserName);
        registerIntent.putExtra("notificationId", notificationId);

        PendingIntent registerPendingIntent = PendingIntent.getBroadcast(
                this, 
                notificationId + 522, 
                registerIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // NOT INTERESTED Action -> goes to Receiver background and does NOT launch/open app
        Intent notInterestedIntent = new Intent(this, ChallengeActionReceiver.class);
        notInterestedIntent.setAction("RaheeQuiz.in.ACTION_NOT_INTERESTED");
        notInterestedIntent.putExtra("notificationId", notificationId);

        PendingIntent notInterestedPendingIntent = PendingIntent.getBroadcast(
                this, 
                notificationId + 523, 
                notInterestedIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(getAppIconResourceId())
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
                .setPriority(NotificationCompat.PRIORITY_MAX);

        notificationBuilder.addAction(android.R.drawable.checkbox_on_background, "REGISTER NOW", registerPendingIntent);
        notificationBuilder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "NOT INTERESTED", notInterestedPendingIntent);

        notificationManager.notify(notificationId, notificationBuilder.build());
    }

    private void sendExamStartedNotification(String title, String body, String examId, String targetUserId, String targetUserName) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        int notificationId = (int) System.currentTimeMillis();
        String channelId = "countdown_notification_channel";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId, 
                    "Countdown Alerts", 
                    NotificationManager.IMPORTANCE_HIGH
            );
            notificationManager.createNotificationChannel(channel);
        }

        // START EXAM Action -> goes to Receiver, which dismisses notification and opens app at exam screen
        Intent startIntent = new Intent(this, ChallengeActionReceiver.class);
        startIntent.setAction("RaheeQuiz.in.ACTION_START_EXAM");
        startIntent.putExtra("examId", examId);
        startIntent.putExtra("targetUserId", targetUserId);
        startIntent.putExtra("targetUserName", targetUserName);
        startIntent.putExtra("notificationId", notificationId);

        PendingIntent startPendingIntent = PendingIntent.getBroadcast(
                this, 
                notificationId + 524, 
                startIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // SKIP EXAM Action -> goes to Receiver, dismisses notification, does NOT launch/open app
        Intent skipIntent = new Intent(this, ChallengeActionReceiver.class);
        skipIntent.setAction("RaheeQuiz.in.ACTION_SKIP_EXAM");
        skipIntent.putExtra("notificationId", notificationId);

        PendingIntent skipPendingIntent = PendingIntent.getBroadcast(
                this, 
                notificationId + 525, 
                skipIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(getAppIconResourceId())
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
                .setPriority(NotificationCompat.PRIORITY_MAX);

        notificationBuilder.addAction(android.R.drawable.ic_media_play, "START EXAM", startPendingIntent);
        notificationBuilder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "SKIP EXAM", skipPendingIntent);

        notificationManager.notify(notificationId, notificationBuilder.build());
    }

    private void sendRegularNotification(String title, String body, String imageUrl) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        String channelId = "general_notification_channel";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId, 
                    "General Alerts", 
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("General game updates and announcements");
            channel.enableLights(true);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] { 0, 250, 250, 250 });
            Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            channel.setSound(defaultSoundUri, null);

            notificationManager.createNotificationChannel(channel);
        }

        Intent intent = null;
        try {
            intent = new Intent(this, Class.forName("RaheeQuiz.in.MainActivity"));
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        } catch (ClassNotFoundException e) {
            intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            }
        }

        PendingIntent pendingIntent = null;
        if (intent != null) {
            int uniqueRequestCode = (int) (System.currentTimeMillis() % 100000);
            pendingIntent = PendingIntent.getActivity(
                    this, 
                    uniqueRequestCode, 
                    intent, 
                    PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(getAppIconResourceId()) // Use app's launcher icon!
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setSound(defaultSoundUri)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE);

        if (pendingIntent != null) {
            builder.setContentIntent(pendingIntent);
        }

        // Try downloading and adding the big picture style image if imageUrl is present
        if (imageUrl != null && !imageUrl.trim().isEmpty()) {
            android.graphics.Bitmap bitmap = getBitmapFromUrl(imageUrl);
            if (bitmap != null) {
                builder.setLargeIcon(bitmap);
                builder.setStyle(new NotificationCompat.BigPictureStyle()
                        .bigPicture(bitmap)
                        .bigLargeIcon(null));
            }
        }

        int uniqueNotificationId = (int) (System.currentTimeMillis() % 100000);
        notificationManager.notify(uniqueNotificationId, builder.build());
    }

    private android.graphics.Bitmap getBitmapFromUrl(String imageUrlStr) {
        if (imageUrlStr == null || imageUrlStr.trim().isEmpty()) {
            return null;
        }
        try {
            java.net.URL url = new java.net.URL(imageUrlStr);
            java.net.HttpURLConnection connection = (java.net.HttpURLConnection) url.openConnection();
            connection.setDoInput(true);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.connect();
            java.io.InputStream input = connection.getInputStream();
            return android.graphics.BitmapFactory.decodeStream(input);
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    private void sendCountdownNotification(String title, String body, final int durationSeconds) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        final int notificationId = (int) (System.currentTimeMillis() % 100000);
        String channelId = "countdown_notification_channel";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId, 
                    "Countdown Alerts", 
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Timed events and exams");
            notificationManager.createNotificationChannel(channel);
        }

        long targetTimeMillis = System.currentTimeMillis() + (durationSeconds * 1000);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(getAppIconResourceId())
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setUsesChronometer(true)
                .setWhen(targetTimeMillis)
                .setChronometerCountDown(true)
                .setPriority(NotificationCompat.PRIORITY_MAX);

        notificationManager.notify(notificationId, builder.build());

        final Context ctx = this;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Thread.sleep(durationSeconds * 1000);
                    NotificationManager mgr = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (mgr != null) {
                        mgr.cancel(notificationId);
                    }

                    String missedChannelId = "missed_events_channel";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        NotificationChannel channel = new NotificationChannel(
                                missedChannelId,
                                "Missed Events",
                                NotificationManager.IMPORTANCE_HIGH
                        );
                        mgr.createNotificationChannel(channel);
                    }

                    NotificationCompat.Builder missedBuilder = new NotificationCompat.Builder(ctx, missedChannelId)
                            .setSmallIcon(getAppIconResourceId())
                            .setContentTitle("Event / Exam Missed")
                            .setContentText("You missed the exam or event!")
                            .setAutoCancel(true)
                            .setPriority(NotificationCompat.PRIORITY_MAX)
                            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));

                    mgr.notify(notificationId + 3000, missedBuilder.build());
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }).start();
    }

    private void sendTextboxReplyNotification(String title, String body) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        int notificationId = (int) (System.currentTimeMillis() % 100000);
        String channelId = "reply_notification_channel";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId, 
                    "Interactive Actions", 
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Allows typing replies from notifications");
            notificationManager.createNotificationChannel(channel);
        }

        Intent replyIntent = new Intent(this, ChallengeActionReceiver.class);
        replyIntent.setAction("RaheeQuiz.in.ACTION_SEND_REPLY");
        replyIntent.putExtra("notificationId", notificationId);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        
        PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
                this, 
                notificationId + 5, 
                replyIntent, 
                flags
        );

        androidx.core.app.RemoteInput remoteInput = new androidx.core.app.RemoteInput.Builder("key_text_reply")
                .setLabel("Type response here...")
                .build();

        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                android.R.drawable.ic_menu_send,
                "Send Message",
                replyPendingIntent
        )
                .addRemoteInput(remoteInput)
                .build();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(getAppIconResourceId())
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .addAction(replyAction);

        notificationManager.notify(notificationId, builder.build());
    }
}
