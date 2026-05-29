package RaheeQuiz.in;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

/**
 * FILE TYPE: JAVA BROADCAST RECEIVER FILE
 * 
 * DIRECTORY PATH (MANDATORY):
 * Save this file inside your Android source folder under the package hierarchy:
 * app/src/main/java/RaheeQuiz/in/ChallengeActionReceiver.java
 *
 * DESCRIPTION:
 * This acts as a background event receiver. It fully handles "ACCEPT" and "REJECT" 
 * button actions triggered directly from the Android status notification shade, 
 * completely bypassing the need to edit or touch MainActivity.java code!
 *
 * It will dismiss the active notification, show a custom toast message feedback, 
 * and start MainActivity cleanly with the appropriate game room actions.
 */
public class ChallengeActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) {
            return;
        }

        String action = intent.getAction();
        String roomId = intent.getStringExtra("roomId");
        String hostId = intent.getStringExtra("hostId");
        String targetUserId = intent.getStringExtra("targetUserId");
        String targetUserName = intent.getStringExtra("targetUserName");
        String senderId = intent.getStringExtra("senderId");
        String senderName = intent.getStringExtra("senderName");
        int notificationId = intent.getIntExtra("notificationId", -1);

        // Sanitize names to default in case they are null
        if (targetUserId == null) targetUserId = "unknown_user";
        if (targetUserName == null) targetUserName = "Opponent";

        // 1. Automatically dismiss the notification from the system status bar
        if (notificationId != -1) {
            NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(notificationId);
            }
        }

        long now = System.currentTimeMillis();

        // 2. Handle the specific click action
        if ("RaheeQuiz.in.ACTION_ACCEPT".equals(action)) {
            // Display rapid visual feedback
            Toast.makeText(context, "Challenge Accepted! Joining match...", Toast.LENGTH_SHORT).show();

            // Perform RTDB background updates for ACCEPT
            // write accepted reply under host's node
            String replyUrl = "https://raheequiz-default-rtdb.firebaseio.com/users/" + hostId + "/challengeReplies/" + targetUserId + ".json";
            String replyPayload = "{\"opponentId\":\"" + targetUserId + "\",\"opponentName\":\"" + targetUserName + "\",\"roomId\":\"" + roomId + "\",\"status\":\"accepted\",\"timestamp\":" + now + "}";
            performBackgroundHttp(replyUrl, "PUT", replyPayload);

            // remove from targetUser's challenges list
            String deleteChallengeUrl = "https://raheequiz-default-rtdb.firebaseio.com/users/" + targetUserId + "/challenges/" + hostId + ".json";
            performBackgroundHttp(deleteChallengeUrl, "DELETE", null);

            // join as participant in match room
            String joinRoomUrl = "https://raheequiz-default-rtdb.firebaseio.com/matches/" + roomId + "/participants/" + targetUserId + ".json";
            String joinPayload = "{\"userId\":\"" + targetUserId + "\",\"userName\":\"" + targetUserName + "\",\"score\":0,\"currentIndex\":0,\"finished\":false,\"accuracy\":0}";
            performBackgroundHttp(joinRoomUrl, "PUT", joinPayload);

            // update room status to accepted
            String statusUrl = "https://raheequiz-default-rtdb.firebaseio.com/matches/" + roomId + "/status.json";
            performBackgroundHttp(statusUrl, "PUT", "\"accepted\"");

            // Launch MainActivity to open acceptor's app and route directly to the lobby room
            launchMainApp(context, "accept", roomId, hostId);

        } else if ("RaheeQuiz.in.ACTION_ACCEPT_FRIEND".equals(action)) {
            Toast.makeText(context, "Friend Request Accepted!", Toast.LENGTH_SHORT).show();

            // Perform RTDB background updates for friend acceptance
            String acceptUrl1 = "https://raheequiz-default-rtdb.firebaseio.com/users/" + targetUserId + "/friends/" + senderId + ".json";
            performBackgroundHttp(acceptUrl1, "PUT", "true");

            String acceptUrl2 = "https://raheequiz-default-rtdb.firebaseio.com/users/" + senderId + "/friends/" + targetUserId + ".json";
            performBackgroundHttp(acceptUrl2, "PUT", "true");

            String pendingUrl1 = "https://raheequiz-default-rtdb.firebaseio.com/users/" + targetUserId + "/pendingRequests/" + senderId + ".json";
            performBackgroundHttp(pendingUrl1, "DELETE", null);

            String pendingUrl2 = "https://raheequiz-default-rtdb.firebaseio.com/users/" + senderId + "/pendingRequests/" + targetUserId + ".json";
            performBackgroundHttp(pendingUrl2, "DELETE", null);

            // Launch MainActivity to dispatch post-acceptance FCM notification to sender
            launchMainApp(context, "friend_accept", null, senderId);

        } else if ("RaheeQuiz.in.ACTION_REJECT_FRIEND".equals(action)) {
            Toast.makeText(context, "Friend Request Declined", Toast.LENGTH_SHORT).show();

            // Perform RTDB background updates for friend rejection
            String pendingUrl1 = "https://raheequiz-default-rtdb.firebaseio.com/users/" + targetUserId + "/pendingRequests/" + senderId + ".json";
            performBackgroundHttp(pendingUrl1, "DELETE", null);

            String pendingUrl2 = "https://raheequiz-default-rtdb.firebaseio.com/users/" + senderId + "/pendingRequests/" + targetUserId + ".json";
            performBackgroundHttp(pendingUrl2, "DELETE", null);

            // Launch MainActivity to dispatch post-rejection FCM notification to sender
            launchMainApp(context, "friend_reject", null, senderId);

        } else if ("RaheeQuiz.in.ACTION_REJECT".equals(action)) {
            // Display rapid visual feedback
            Toast.makeText(context, "Challenge Rejected", Toast.LENGTH_SHORT).show();

            // Perform RTDB background updates for REJECT
            // write rejected reply under host's node
            String replyUrl = "https://raheequiz-default-rtdb.firebaseio.com/users/" + hostId + "/challengeReplies/" + targetUserId + ".json";
            String replyPayload = "{\"opponentId\":\"" + targetUserId + "\",\"opponentName\":\"" + targetUserName + "\",\"roomId\":\"" + roomId + "\",\"status\":\"rejected\",\"timestamp\":" + now + "}";
            performBackgroundHttp(replyUrl, "PUT", replyPayload);

            // remove from targetUser's challenges list
            String deleteChallengeUrl = "https://raheequiz-default-rtdb.firebaseio.com/users/" + targetUserId + "/challenges/" + hostId + ".json";
            performBackgroundHttp(deleteChallengeUrl, "DELETE", null);

            // DO NOT launch MainActivity here! The notification is dismissed in the background.
        } else if ("RaheeQuiz.in.ACTION_PLAY_NOW".equals(action)) {
            Toast.makeText(context, "Launching game...", Toast.LENGTH_SHORT).show();
            // Starts the main app and navigates to the respective game room
            launchMainApp(context, "play_now", roomId, hostId);

        } else if ("RaheeQuiz.in.ACTION_CHALLENGE_AGAIN".equals(action)) {
            Toast.makeText(context, "Challenge sent again!", Toast.LENGTH_SHORT).show();

            String oppId = intent.getStringExtra("opponentId");
            String oppName = intent.getStringExtra("opponentName");
            if (oppId == null) oppId = hostId;
            if (oppName == null) oppName = "Opponent";

            // Fire an async challenge update under opponent's node in the background without launching the app
            String reChallengeUrl = "https://raheequiz-default-rtdb.firebaseio.com/users/" + oppId + "/challenges/" + targetUserId + ".json";
            String challengePayload = "{\"hostId\":\"" + targetUserId + "\",\"hostName\":\"" + targetUserName + "\",\"roomId\":\"" + (roomId != null ? roomId : "room_" + now) + "\",\"timestamp\":" + now + ",\"status\":\"pending\"}";
            performBackgroundHttp(reChallengeUrl, "PUT", challengePayload);

            // DO NOT open the app, this action only swipes/dismisses the notification

        } else if ("RaheeQuiz.in.ACTION_REGISTER_NOW".equals(action)) {
            Toast.makeText(context, "Registered successfully for Exam!", Toast.LENGTH_SHORT).show();

            String examId = intent.getStringExtra("examId");
            if (examId == null) examId = "general_exam";

            // Save registration record under Firebase RTDB for active tracking
            String registerUrl = "https://raheequiz-default-rtdb.firebaseio.com/users/" + targetUserId + "/registrations/" + examId + ".json";
            String registerPayload = "{\"registered\":true,\"timestamp\":" + now + ",\"userName\":\"" + targetUserName + "\"}";
            performBackgroundHttp(registerUrl, "PUT", registerPayload);

            // DO NOT open the app automatically, this action only swipes/dismisses the notification

        } else if ("RaheeQuiz.in.ACTION_NOT_INTERESTED".equals(action)) {
            Toast.makeText(context, "Dismissed exam info", Toast.LENGTH_SHORT).show();
            // DO NOT open the app automatically, this action only swipes/dismisses the notification

        } else if ("RaheeQuiz.in.ACTION_START_EXAM".equals(action)) {
            Toast.makeText(context, "Opening Exam Screen...", Toast.LENGTH_SHORT).show();
            // Launches the app and navigates directly to the exam screen
            String examId = intent.getStringExtra("examId");
            launchMainApp(context, "start_exam", examId, null);

        } else if ("RaheeQuiz.in.ACTION_SKIP_EXAM".equals(action)) {
            Toast.makeText(context, "Exam skipped", Toast.LENGTH_SHORT).show();
            // DO NOT open the app, this action only swipes/dismisses the notification

        } else if ("RaheeQuiz.in.ACTION_SEND_REPLY".equals(action)) {
            android.os.Bundle remoteInputResult = androidx.core.app.RemoteInput.getResultsFromIntent(intent);
            if (remoteInputResult != null) {
                CharSequence replySeq = remoteInputResult.getCharSequence("key_text_reply");
                if (replySeq != null && replySeq.length() > 0) {
                    String userReply = replySeq.toString();
                    Toast.makeText(context, "Reply Sent: " + userReply, Toast.LENGTH_SHORT).show();

                    // Save reply to Firebase RTDB for web dashboard monitoring
                    String rtdbUrl = "https://raheequiz-default-rtdb.firebaseio.com/notificationReplies/" + now + ".json";
                    String jsonPayload = "{\"message\":\"" + userReply.replace("\"", "\\\"").replace("\n", "\\n") + "\",\"timestamp\":" + now + "}";
                    performBackgroundHttp(rtdbUrl, "PUT", jsonPayload);
                }
            }
        }
    }

    private void performBackgroundHttp(final String urlStr, final String method, final String payload) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                java.net.HttpURLConnection conn = null;
                try {
                    java.net.URL url = new java.net.URL(urlStr);
                    conn = (java.net.HttpURLConnection) url.openConnection();
                    conn.setRequestMethod(method);
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    
                    if (payload != null) {
                        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                        conn.setDoOutput(true);
                        java.io.OutputStream os = conn.getOutputStream();
                        byte[] input = payload.getBytes("utf-8");
                        os.write(input, 0, input.length);
                        os.close();
                    }
                    
                    int responseCode = conn.getResponseCode();
                    android.util.Log.d("ChallengeReceiver", "RTDB Async " + method + " response code: " + responseCode);
                } catch (Exception e) {
                    e.printStackTrace();
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }
        }).start();
    }

    private void launchMainApp(Context context, String actionType, String roomId, String hostId) {
        Intent appIntent = null;
        try {
            // Target the package's MainActivity cleanly
            appIntent = new Intent(context, Class.forName("RaheeQuiz.in.MainActivity"));
            appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            appIntent.putExtra("action_type", actionType);
            appIntent.putExtra("roomId", roomId);
            appIntent.putExtra("hostId", hostId);
        } catch (ClassNotFoundException e) {
            appIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (appIntent != null) {
                appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                appIntent.putExtra("action_type", actionType);
                appIntent.putExtra("roomId", roomId);
                appIntent.putExtra("hostId", hostId);
            }
        }
        if (appIntent != null) {
            context.startActivity(appIntent);
        }
    }
}
