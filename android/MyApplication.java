package RaheeQuiz.in;

import android.app.Application;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * FILE TYPE: JAVA APPLICATION DECLARATION FILE
 * 
 * DIRECTORY PATH (MANDATORY):
 * Save this file inside your Android source folder under the package hierarchy:
 * app/src/main/java/RaheeQuiz/in/MyApplication.java
 *
 * DESCRIPTION:
 * This runs immediately when the application starts, before any Activity.
 * It initializes Firebase, auto-subscribes the user to the broadcast "all_users" topic,
 * and publishes the active FCM registration token directly to publicFcmTokens in RTDB.
 *
 * HOW TO CONFIG IN ANDROID:
 * Add android:name=".MyApplication" to the <application> element in your AndroidManifest.xml:
 * <application
 *     android:name=".MyApplication"
 *     android:label="@string/app_name"
 *     ... >
 */
public class MyApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        
        // 1. Initialize FirebaseApp context securely
        try {
            FirebaseApp.initializeApp(this);
            android.util.Log.d("MyApplication", "FirebaseApp initialized successfully");
        } catch (Exception e) {
            android.util.Log.e("MyApplication", "FirebaseApp initialization failed", e);
        }

        // 2. Automatically subscribe user to the "all_users" topic for admin broadcasts
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("all_users")
                .addOnCompleteListener(new com.google.android.gms.tasks.OnCompleteListener<Void>() {
                    @Override
                    public void onComplete(com.google.android.gms.tasks.Task<Void> task) {
                        if (task.isSuccessful()) {
                            android.util.Log.d("FCM", "MyApplication: Subscribed successfully to all_users broadcast topic");
                        } else {
                            android.util.Log.e("FCM", "MyApplication: Subscription to all_users topic failed", task.getException());
                        }
                    }
                });
        } catch (Exception e) {
            android.util.Log.e("FCM", "Error in MyApplication subscribing to all_users topic", e);
        }

        // 3. Immediately capture and register current FCM device token to central RTDB
        registerDeviceTokenToDatabase();
    }

    private void registerDeviceTokenToDatabase() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String token = null;
                    // Try traditional/older FirebaseInstanceId first (used in Sketchware)
                    try {
                        token = com.google.firebase.iid.FirebaseInstanceId.getInstance().getToken();
                    } catch (Throwable e) {
                        android.util.Log.w("FCM", "FirebaseInstanceId.getInstance().getToken() call failed, trying alternative...", e);
                    }

                    if (token != null && !token.trim().isEmpty()) {
                        sendTokenToRTDB(token);
                    } else {
                        android.util.Log.w("FCM", "No registration token fetched (token is null or empty)");
                    }
                } catch (Exception e) {
                    android.util.Log.e("FCM", "Exception during token registration in application start", e);
                }
            }
        }).start();
    }

    private void sendTokenToRTDB(final String token) {
        // Sanitize token for Firebase Realtime Database path safety
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
                    android.util.Log.d("MyApplication_FCM", "Device Token registered to publicFcmTokens. Code: " + responseCode);
                } catch (Exception e) {
                    android.util.Log.e("MyApplication_FCM", "Failed sending token to RTDB endpoint", e);
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }
        }).start();
    }
}
