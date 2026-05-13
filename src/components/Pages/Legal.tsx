import React from "react";
import { Shield, EyeOff } from "lucide-react";

export const PrivacyPolicy: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="auth-card glass animate-fade" style={{ maxWidth: "600px", margin: "2rem auto", maxHeight: "80vh", overflowY: "auto", padding: "2.5rem" }}>
    <h1 style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <EyeOff className="text-primary" /> Privacy Policy
    </h1>
    <p className="text-muted" style={{ marginBottom: "2rem" }}>Last updated: May 6, 2026</p>
    
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem", color: "var(--primary)" }}>1. Zero Knowledge Architecture</h2>
      <p>Securem is built on a zero-knowledge architecture. This means your messages, private keys, and passwords never leave your device in a readable format. We cannot read your messages even if we wanted to.</p>
    </section>

    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem", color: "var(--primary)" }}>2. Data Collection</h2>
      <p>We collect the minimum amount of data required to operate the service:</p>
      <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
        <li><strong>Username</strong>: For others to find you (Exact match only).</li>
        <li><strong>Public Key</strong>: To allow others to encrypt messages for you.</li>
        <li><strong>Email</strong>: For account recovery and authentication.</li>
      </ul>
    </section>

    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem", color: "var(--primary)" }}>3. End-to-End Encryption</h2>
      <p>All messages are encrypted using AES-256-GCM. Key exchange is performed via RSA-2048-OAEP. Authenticity is guaranteed via RSA-PSS digital signatures.</p>
    </section>
    
    <button onClick={onClose} className="btn-primary" style={{ width: "100%" }}>Back to App</button>
  </div>
);

export const TermsOfService: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="auth-card glass animate-fade" style={{ maxWidth: "600px", margin: "2rem auto", maxHeight: "80vh", overflowY: "auto", padding: "2.5rem" }}>
    <h1 style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <Shield className="text-primary" /> Terms of Service
    </h1>
    <p className="text-muted" style={{ marginBottom: "2rem" }}>Last updated: May 6, 2026</p>
    
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem", color: "var(--primary)" }}>1. Acceptance of Terms</h2>
      <p>By using Securem, you agree to these terms. Securem is provided "as is" without any warranties.</p>
    </section>

    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem", color: "var(--primary)" }}>2. Responsible Use</h2>
      <p>You are responsible for maintaining the confidentiality of your Crypto Password. If you lose your Crypto Password, your messages will be permanently unrecoverable.</p>
    </section>
    
    <button onClick={onClose} className="btn-primary" style={{ width: "100%" }}>Accept & Back</button>
  </div>
);

export const AboutSecurem: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="auth-card glass animate-fade" style={{ maxWidth: "600px", margin: "2rem auto", maxHeight: "80vh", overflowY: "auto", padding: "2.5rem" }}>
    <h1 style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <Shield className="text-primary" /> About Securem
    </h1>
    <p className="text-muted" style={{ marginBottom: "2rem" }}>Military-Grade Privacy for Everyone.</p>
    
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div className="glass" style={{ padding: "1.5rem", borderRadius: "16px" }}>
        <h3 style={{ marginBottom: "0.5rem", color: "var(--primary)" }}>End-to-End Encryption</h3>
        <p style={{ fontSize: "0.875rem" }}>Messages are encrypted locally using AES-256-GCM. We never see your plaintext data.</p>
      </div>
      
      <div className="glass" style={{ padding: "1.5rem", borderRadius: "16px" }}>
        <h3 style={{ marginBottom: "0.5rem", color: "var(--primary)" }}>Digital Signatures</h3>
        <p style={{ fontSize: "0.875rem" }}>Using RSA-PSS to ensure that every message is cryptographically proven to be from the sender.</p>
      </div>

      <div className="glass" style={{ padding: "1.5rem", borderRadius: "16px" }}>
        <h3 style={{ marginBottom: "0.5rem", color: "var(--primary)" }}>Zero-Knowledge</h3>
        <p style={{ fontSize: "0.875rem" }}>Your keys are stored in a secure local database (IndexedDB) and encrypted with your Crypto Password.</p>
      </div>
    </div>
    
    <button onClick={onClose} className="btn-primary" style={{ width: "100%", marginTop: "2rem" }}>Got it</button>
  </div>
);
