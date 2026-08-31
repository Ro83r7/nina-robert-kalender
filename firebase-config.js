// Werte aus der Firebase-Konsole eintragen (Projekteinstellungen -> "Web-App" -> Config).
// Diese Werte sind öffentliche Client-Konfiguration - kein Geheimnis, dürfen committet werden.
// Solange hier "DEIN_API_KEY" steht, läuft die App im Demo-Modus (nichts wird gespeichert).
export const firebaseConfig = {
  apiKey: "DEIN_API_KEY",
  authDomain: "DEIN_PROJEKT.firebaseapp.com",
  projectId: "DEIN_PROJEKT",
  storageBucket: "DEIN_PROJEKT.appspot.com",
  messagingSenderId: "DEINE_SENDER_ID",
  appId: "DEINE_APP_ID"
};
