import React, { useState } from "react";
import { createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../../services/firebase";
import { useCrypto } from "../../context/CryptoContext";
import { registerUser, checkUsernameAvailability, type UserProfile } from "../../services/userService";
import { useAuth } from "../../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";

const Signup: React.FC<{ onToggle: () => void }> = ({ onToggle }) => {
  const [step, setStep] = useState(auth.currentUser ? 2 : 1);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  const { setup } = useCrypto();
  const { refreshProfile, updateProfileState } = useAuth();

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
      // Main App logic will handle redirect to username setup if needed
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const checkUsername = async (val: string) => {
    setUsername(val);
    if (val.length >= 3) {
      try {
        const avail = await checkUsernameAvailability(val);
        setIsAvailable(avail);
      } catch (err) {
        console.error("Username check failed:", err);
        setIsAvailable(null); // Keep disabled if check fails
      }
    } else {
      setIsAvailable(null);
    }
  };

  const handleSignup = async (e: any) => {
    // 1. CLICK LOG
    console.log(">>> CLICK: Complete Setup Button");
    if (e && e.preventDefault) e.preventDefault();
    
    // 2. HANDLER START
    console.log(">>> HANDLER START: Initializing onboarding flow");
    
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      console.error(">>> FAILURE: Username is empty");
      setError("Username is required");
      return;
    }
    
    if (isAvailable !== true) {
      console.error(">>> FAILURE: Username not available or check pending. State:", isAvailable);
      setError("Please wait for username availability check or choose another.");
      return;
    }
    
    setLoading(true);
    setError("");

    try {
      setStatus("Checking authentication...");
      console.log(">>> EXECUTION: Checking auth.currentUser...");
      let uid = auth.currentUser?.uid;
      let finalEmail = auth.currentUser?.email || email;

      if (!uid) {
        console.log(">>> EXECUTION: No current user, attempting email signup...");
        setStatus("Creating account...");
        if (!email || !password) throw new Error("Email and password are required for new accounts");
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        uid = userCredential.user.uid;
        finalEmail = userCredential.user.email || email;
      }
      
      console.log(">>> EXECUTION: Found UID:", uid);

      setStatus("Generating secure encryption keys...");
      console.log(">>> BEFORE CRYPTO: Generating RSA Keypair...");
      const { publicKey, signingPublicKey, backup } = await setup(password);
      console.log(">>> AFTER CRYPTO: Keys generated.");

      setStatus("Saving profile to database...");
      console.log(">>> BEFORE WRITE: Sending to Firestore /users/" + uid);
      const newProfile: UserProfile = {
        uid,
        username: cleanUsername,
        publicKey,
        signingPublicKey,
        email: finalEmail,
        encryptedPrivateKey: backup.encryptedPrivateKey,
        encryptedSigningKey: backup.encryptedSigningKey,
        keySalt: backup.salt
      };

      await registerUser(newProfile);
      console.log(">>> WRITE SUCCESS: Profile and username registered.");

      setStatus("Syncing session...");
      console.log(">>> EXECUTION: Updating local state and refreshing...");
      updateProfileState(newProfile);
      await refreshProfile();
      
      setStatus("Ready!");
      console.log(">>> HANDLER END: Signup flow complete. Navigation should trigger.");
      alert("Setup Complete! Welcome to Securem.");
    } catch (err: any) {
      console.error(">>> FAILURE POINT ERROR:", err);
      setError("Error at step [" + status + "]: " + (err.message || "Unknown error"));
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card glass animate-fade">
      <h1>Join Securem</h1>
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.form 
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onSubmit={handleStep1}
          >
            <p>Start your secure communication journey.</p>
            <div style={{ marginBottom: "1rem" }}>
              <input 
                type="email" 
                placeholder="Email Address" 
                required 
                value={email} 
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <input 
                type="password" 
                placeholder="Create Password" 
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: "100%" }}>
              Continue
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1.5rem 0" }}>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }}></div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>OR</span>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }}></div>
            </div>

            <button 
              type="button"
              onClick={handleGoogleSignup} 
              className="btn-secondary" 
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
              disabled={loading}
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="Google" />
              Sign up with Google
            </button>
          </motion.form>
        ) : (
          <div key="step2">
            <p>Choose a unique username and Crypto Password.</p>
            <div style={{ marginBottom: "1rem" }}>
              <input 
                type="text" 
                placeholder="Username" 
                required 
                value={username} 
                onChange={e => checkUsername(e.target.value)}
              />
              {isAvailable === true && <small style={{ color: "var(--accent)" }}>Username available!</small>}
              {isAvailable === false && <small style={{ color: "var(--error)" }}>Username taken</small>}
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <input 
                type="password" 
                placeholder="Crypto Password (for encryption)" 
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)}
              />
              <small style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>This password secures your keys locally. Don't lose it!</small>
            </div>
            <button 
              type="button"
              onClick={handleSignup} 
              className="btn-primary" 
              style={{ width: "100%" }} 
              disabled={loading || !isAvailable}
            >
              {loading ? (status || "Processing...") : "Complete Setup"}
            </button>
            {status && !error && <p style={{ color: "var(--primary)", marginTop: "0.5rem", fontSize: "0.75rem", textAlign: "center" }}>{status}</p>}
          </div>
        )}
      </AnimatePresence>
      {error && <p style={{ color: "var(--error)", marginTop: "1rem", fontSize: "0.875rem" }}>{error}</p>}
      <p style={{ marginTop: "1.5rem", fontSize: "0.875rem", textAlign: "center" }}>
        Already have an account? <span onClick={onToggle} style={{ color: "var(--primary)", cursor: "pointer" }}>Login</span>
      </p>
    </div>
  );
};

export default Signup;
