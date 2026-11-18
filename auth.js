// Google sign-in + per-user progress in Firestore (users/{uid}). Loaded as a module after quest-engine.js.
const cfg = window.DAGDEEP_FIREBASE;
const Q = window.QUEST;
if (!cfg || !cfg.apiKey){
  window.DAGDEEP_AUTH = {configured:false};
} else {
  const V = "10.12.2", base = `https://www.gstatic.com/firebasejs/${V}`;
  try {
    const [{initializeApp}, A, F] = await Promise.all([
      import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)
    ]);
    const app = initializeApp(cfg);
    const auth = A.getAuth(app), db = F.getFirestore(app), provider = new A.GoogleAuthProvider();
    provider.setCustomParameters({prompt:"select_account"});
    window.DAGDEEP_AUTH = {
      configured:true,
      signIn:() => A.signInWithPopup(auth, provider),
      signOut:() => A.signOut(auth)
    };
    A.onAuthStateChanged(auth, async user => {
      if (!user){ if (Q.account) Q.useGuest(); return; }
      const ref = F.doc(db, "users", user.uid);
      let cloud = null;
      try { const snap = await F.getDoc(ref); if (snap.exists()) cloud = snap.data(); } catch(e){ console.warn("Progress load failed", e); }
      Q.cloud = {save:state => F.setDoc(ref, {quest:state.quest, profile:state.profile, updatedAt:F.serverTimestamp()}).catch(e => console.warn("Progress save failed", e))};
      Q.useAccount({uid:user.uid, displayName:user.displayName, email:user.email, photoURL:user.photoURL}, cloud);
    });
  } catch(e){
    console.warn("Google sign-in unavailable", e);
    window.DAGDEEP_AUTH = {configured:false};
  }
}
