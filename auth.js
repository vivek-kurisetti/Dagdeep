// Google sign-in + per-user progress in Firestore (users/{uid}). Loaded as a module after quest-engine.js.
// window.DAGDEEP_AUTH = {state, configured, signIn(), signOut(), message(err)}
const cfg = window.DAGDEEP_FIREBASE;
const Q = window.QUEST;
const MSG = {
  "auth/unauthorized-domain": `This site (${location.hostname}) isn't on the Firebase list of authorized domains. Add it in Firebase → Authentication → Settings → Authorized domains.`,
  "auth/operation-not-allowed": "Google sign-in isn't enabled in Firebase yet (Authentication → Sign-in method → Google).",
  "auth/configuration-not-found": "Google sign-in isn't enabled in Firebase yet (Authentication → Sign-in method → Google).",
  "auth/popup-closed-by-user": "The sign-in window was closed before finishing.",
  "auth/cancelled-popup-request": "Another sign-in window is already open.",
  "auth/network-request-failed": "Network problem. Check your connection and try again.",
  "auth/internal-error": "Google sign-in hit an internal error. Try again in a moment.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/web-storage-unsupported": "Your browser is blocking storage that sign-in needs (private mode or strict cookie settings)."
};
const message = e => (e && MSG[e.code]) || (e && e.code ? `Sign-in failed (${e.code}).` : "Sign-in failed. Try again.");
// In-app browsers (LinkedIn, Instagram, Facebook…) are blocked by Google sign-in.
const inApp = /(FBAN|FBAV|Instagram|LinkedInApp|Line\/|Twitter|MicroMessenger|; wv\))/i.test(navigator.userAgent);

if (!cfg || !cfg.apiKey){
  window.DAGDEEP_AUTH = {state:"off", configured:false, inApp, message};
} else {
  window.DAGDEEP_AUTH = {state:"loading", configured:true, inApp, message};
  const V = "10.12.2", base = `https://www.gstatic.com/firebasejs/${V}`;
  try {
    const [{initializeApp}, A, F] = await Promise.all([
      import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)
    ]);
    const app = initializeApp(cfg);
    const auth = A.getAuth(app), db = F.getFirestore(app), provider = new A.GoogleAuthProvider();
    provider.setCustomParameters({prompt:"select_account"});
    await A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
    const signIn = async () => {
      try { return await A.signInWithPopup(auth, provider); }
      catch(e){
        // Popups are blocked on some phones and browsers: fall back to a full-page redirect.
        if (["auth/popup-blocked", "auth/operation-not-supported-in-environment"].includes(e.code)) return A.signInWithRedirect(auth, provider);
        throw e;
      }
    };
    window.DAGDEEP_AUTH = {state:"ready", configured:true, inApp, message, signIn, signOut:() => A.signOut(auth)};
    A.getRedirectResult(auth).catch(e => { if (e && e.code) Q.toastMsg && Q.toastMsg("⚠️ " + message(e)); });
    A.onAuthStateChanged(auth, async user => {
      if (!user){ if (Q.account) Q.useGuest(); return; }
      const ref = F.doc(db, "users", user.uid);
      let cloud = null;
      Q.sync = {state:"loading"};
      try { const snap = await F.getDoc(ref); if (snap.exists()) cloud = snap.data(); Q.sync = {state:"ok", at:Date.now()}; }
      catch(e){ console.warn("Progress load failed", e); Q.sync = {state:"error", code:e.code}; }
      Q.cloud = {save:state => F.setDoc(ref, {quest:state.quest, profile:state.profile, name:user.displayName || "", updatedAt:F.serverTimestamp()})
        .then(() => { Q.sync = {state:"ok", at:Date.now()}; })
        .catch(e => { console.warn("Progress save failed", e); Q.sync = {state:"error", code:e.code}; })};
      Q.useAccount({uid:user.uid, displayName:user.displayName, email:user.email, photoURL:user.photoURL}, cloud);
    });
  } catch(e){
    console.warn("Google sign-in unavailable", e);
    window.DAGDEEP_AUTH = {state:"failed", configured:true, inApp, message, error:"Couldn't load Google sign-in (network or an ad blocker)."};
  }
}
