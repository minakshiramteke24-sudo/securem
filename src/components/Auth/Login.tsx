import React, { useState } from "react";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../../services/firebase";
import { useCrypto } from "../../context/CryptoContext";

const Login: React.FC<{ onToggle: () => void }> = ({ onToggle }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { unlock } = useCrypto();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      await unlock(password);
    } catch (err: any) {
      setError(err.message === "No keys found on this device" 
        ? "Private key not found on this device. E2EE requires local keys." 
        : "Invalid email or password");
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
      // NOTE: Google users will be prompted for their Crypto Password 
      // in the main App component if keys are locked.
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="auth-card glass animate-fade">
      <h1>Welcome Back</h1>
      <p>Securely log in to your account.</p>
      <form onSubmit={handleLogin}>
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
            placeholder="Password" 
            required 
            value={password} 
            onChange={e => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Unlocking..." : "Login"}
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1.5rem 0" }}>
        <div style={{ flex: 1, height: "1px", background: "var(--border)" }}></div>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>OR</span>
        <div style={{ flex: 1, height: "1px", background: "var(--border)" }}></div>
      </div>

      <button 
        onClick={handleGoogleLogin} 
        className="btn-secondary" 
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
        disabled={loading}
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="Google" />
        Continue with Google
      </button>

      {error && <p style={{ color: "var(--error)", marginTop: "1rem", fontSize: "0.875rem" }}>{error}</p>}
      <p style={{ marginTop: "1.5rem", fontSize: "0.875rem", textAlign: "center" }}>
        Don't have an account? <span onClick={onToggle} style={{ color: "var(--primary)", cursor: "pointer" }}>Sign up</span>
      </p>
    </div>
  );
};

export default Login;
