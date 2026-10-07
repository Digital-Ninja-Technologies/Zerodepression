/* Firebase web-app config for the anonymous chat.
 *
 * These values are public by design: they only identify the project. Access is controlled by
 * backend/firestore.rules, not by hiding this file.
 *
 * Fill them in from: Firebase console -> Project settings -> Your apps -> Web app -> SDK setup and configuration.
 * Until real values are present the chat pages show a safe "chat isn't available yet, please call" message.
 */
window.ZD_FIREBASE_CONFIG = {
  apiKey: "REPLACE_WITH_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID",
};
