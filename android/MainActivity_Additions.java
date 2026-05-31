package RaheeQuiz.in;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * FILE TYPE: JAVA MAIN_ACTIVITY & MANIFEST HELPER TEMPLATE
 * 
 * DIRECTORY PATH (MANDATORY LOCAL PLACEMENT):
 * Place this integration logic directly inside your local Android project:
 * - app/src/main/java/RaheeQuiz/in/MainActivity.java
 * - app/src/main/AndroidManifest.xml
 *
 * DESCRIPTION:
 * This helper shows exactly how to initialize custom FCM channels, handle background
 * notification tap intents (e.g. Accept/Play Now action buttons click), subscribe users to the
 * "all_users" broadcast topic, and route dynamic data variables (like tokens or actions)
 * directly into your React/Vite WebView wrapper!
 */
public class MainActivity_Additions extends AppCompatActivity {

    private WebView myWebView; // Reference your actual WebView instance

    // ------------------------------------------------------------
    // SECTION 1: ADD THIS CODE INSIDE YOUR MainActivity's onCreate()
    // ------------------------------------------------------------
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 1. Create all high-priority interactive notification channels on startup
        createNotificationChannels();

        // 2. Request POST_NOTIFICATIONS runtime permission on Android 13+ (API 33+)
        requestNotificationPermission();

        // 3. Automatically subscribe user to the "all_users" topic for admin broadcasts
        subscribeToBroadcastTopic();

        // 4. Handle push notification click intents on fresh startup
        handleIncomingIntent(getIntent());

        // 5. Register Javascript Interface for fcm handshake:
        // Example configuration inside your onCreate:
        // myWebView = findViewById(R.id.webview);
        // myWebView.getSettings().setJavaScriptEnabled(true);
        // myWebView.addJavascriptInterface(new WebAppInterface(this), "AndroidInterface");
    }

    // ------------------------------------------------------------
    // SECTION 2: ADD THIS METHOD INSIDE YOUR MainActivity.java
    // ------------------------------------------------------------
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        
        // Handle push notification click intents when app is running in background/active
        handleIncomingIntent(intent);
    }

    // ------------------------------------------------------------
    // SECTION 3: CORE INTENT ROUTING TO COUPLING WEB APP
    // ------------------------------------------------------------
    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;

        String actionType = intent.getStringExtra("action_type");
        String roomId = intent.getStringExtra("roomId");
        String opponentId = intent.getStringExtra("opponentId");
        String hostId = intent.getStringExtra("hostId");

        if (actionType != null && !actionType.trim().isEmpty()) {
            Toast.makeText(this, "Notification Action: " + actionType.toUpperCase(), Toast.LENGTH_LONG).show();
            
            // Generate Javascript execution script to dispatch the action into React app state!
            final String jsScript = String.format(
                "if (window.handleNotificationMatchAction) { " +
                "  window.handleNotificationMatchAction('%s', '%s', '%s', '%s'); " +
                "} else { " +
                "  console.warn('React notification handler not mounted yet'); " +
                "}", 
                actionType, 
                roomId != null ? roomId : "", 
                opponentId != null ? opponentId : "", 
                hostId != null ? hostId : ""
            );

            // Execute on the main UI thread inside your Webview
            if (myWebView != null) {
                myWebView.post(new Runnable() {
                    @Override
                    public void run() {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                            myWebView.evaluateJavascript(jsScript, null);
                        } else {
                            myWebView.loadUrl("javascript:" + jsScript);
                        }
                    }
                });
            }
        }
    }

    // Creates the required system priority channels for notification categories
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            // 1. Challenges Channel
            NotificationChannel challengeChan = new NotificationChannel(
                "match_challenges_channel",
                "Match Challenges",
                NotificationManager.IMPORTANCE_HIGH
            );
            challengeChan.setDescription("Incoming multiplayer match challenges and action reply states.");
            challengeChan.enableLights(true);
            challengeChan.enableVibration(true);
            manager.createNotificationChannel(challengeChan);

            // 2. Interactive Channel
            NotificationChannel replyChan = new NotificationChannel(
                "reply_notification_channel",
                "Interactive Actions",
                NotificationManager.IMPORTANCE_HIGH
            );
            replyChan.setDescription("Allows typing custom text responses directly from the notification tray.");
            replyChan.enableLights(true);
            manager.createNotificationChannel(replyChan);

            // 3. Countdown Event Channel
            NotificationChannel countdownChan = new NotificationChannel(
                "countdown_notification_channel",
                "Countdown Alerts",
                NotificationManager.IMPORTANCE_HIGH
            );
            countdownChan.setDescription("Chronometer countdowns for geologist exams and interactive live quiz matches.");
            manager.createNotificationChannel(countdownChan);
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) { // Android 13 POST_NOTIFICATIONS
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) 
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
    }

    private void subscribeToBroadcastTopic() {
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("all_users")
                .addOnCompleteListener(new com.google.android.gms.tasks.OnCompleteListener<Void>() {
                    @Override
                    public void onComplete(com.google.android.gms.tasks.Task<Void> task) {
                        if (task.isSuccessful()) {
                            android.util.Log.d("FCM", "Subscribed successfully to all_users broadcast topic");
                        } else {
                            android.util.Log.e("FCM", "Subscription to all_users topic failed", task.getException());
                        }
                    }
                });
        } catch (Exception e) {
            android.util.Log.e("FCM", "Failed subscribing to topic", e);
        }
    }

    // ------------------------------------------------------------
    // SECTION 4: WEBVIEW JAVASCRIPT DIRECT COMM BRIDGE INTERFACE
    // ------------------------------------------------------------
    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        /**
         * Fetch current FCM registration token and direct it right into the React App state!
         * React calls window.AndroidInterface.registerUserFCM(userId, userName) upon authentication.
         */
        @JavascriptInterface
        public void registerUserFCM(final String userId, final String userName) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        String token = null;
                        try {
                            token = com.google.firebase.iid.FirebaseInstanceId.getInstance().getToken();
                        } catch (Throwable e) {
                            android.util.Log.w("FCM", "Failed getting token using FirebaseInstanceId", e);
                        }

                        if (token == null || token.trim().isEmpty()) {
                            android.util.Log.w("FCM", "No token found in registerUserFCM thread");
                            return;
                        }

                        final String finalToken = token;
                        android.util.Log.d("FCM", "Fetched registration token: " + finalToken);

                        // Ensure topic subscription is active too
                        subscribeToBroadcastTopic();

                        // Safely dispatch the token directly back into the mounted React WebView layout!
                        final String jsScript = String.format("if (window.onFCMTokenReceived) { window.onFCMTokenReceived('%s'); }", finalToken);
                        if (myWebView != null) {
                            myWebView.post(new Runnable() {
                                @Override
                                public void run() {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                                        myWebView.evaluateJavascript(jsScript, null);
                                    } else {
                                        myWebView.loadUrl("javascript:" + jsScript);
                                    }
                                }
                            });
                        }
                    } catch (Exception e) {
                        android.util.Log.e("FCM", "Error in registerUserFCM interface call", e);
                    }
                }
            }).start();
        }
    }

    // ------------------------------------------------------------
    // SECTION 5: AndroidManifest.xml DECLARATIONS REFERENCE
    // ------------------------------------------------------------
    /*
    Add these XML elements inside your AndroidManifest.xml under the <application> parent node:
 
    <!-- Required permissions at top main manifest hierarchy -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
 
    <!-- FCM Messaging Background Daemon Service -->
    <service
        android:name="RaheeQuiz.in.MyFirebaseMessagingService"
        android:exported="false">
        <intent-filter>
            <action android:name="com.google.firebase.MESSAGING_EVENT" />
        </intent-filter>
    </service>
 
    <!-- Custom Multi-Click Broadcast Receiver, completely separate from MainActivity! -->
    <receiver 
        android:name="RaheeQuiz.in.ChallengeActionReceiver"
        android:exported="false">
        <intent-filter>
            <action android:name="RaheeQuiz.in.ACTION_ACCEPT" />
            <action android:name="RaheeQuiz.in.ACTION_REJECT" />
            <action android:name="RaheeQuiz.in.ACTION_ACCEPT_FRIEND" />
            <action android:name="RaheeQuiz.in.ACTION_REJECT_FRIEND" />
            <action android:name="RaheeQuiz.in.ACTION_SEND_REPLY" />
            <action android:name="RaheeQuiz.in.ACTION_PLAY_NOW" />
            <action android:name="RaheeQuiz.in.ACTION_CHALLENGE_AGAIN" />
            <action android:name="RaheeQuiz.in.ACTION_REGISTER_NOW" />
            <action android:name="RaheeQuiz.in.ACTION_NOT_INTERESTED" />
            <action android:name="RaheeQuiz.in.ACTION_START_EXAM" />
            <action android:name="RaheeQuiz.in.ACTION_SKIP_EXAM" />
        </intent-filter>
    </receiver>
    */
}
