"use client";

import { useEffect, useState } from "react";
import { getCurrentConsultant, updateCurrentConsultant } from "@/lib/authApi";
import { showError, showSuccess, showInfo } from "@/lib/toast";
import { Eye, EyeOff, X } from "lucide-react";

export default function Integrations() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [helpModal, setHelpModal] = useState(null); // 'razorpay' | 'gemini' | null

  // Form states
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
  const [razorpayWebhookSecret, setRazorpayWebhookSecret] = useState("");

  // Configured flags (from backend)
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [razorpayConfigured, setRazorpayConfigured] = useState(false);
  const [webhookConfigured, setWebhookConfigured] = useState(false);

  // Visibility toggles
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showRazorpaySecret, setShowRazorpaySecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadIntegrations() {
      try {
        setLoading(true);
        const consultant = await getCurrentConsultant(true);
        if (!isMounted) return;

        const integrations = consultant?.integrations || {};

        if (integrations.gemini_api_key_configured) {
          setGeminiConfigured(true);
          setGeminiApiKey(integrations.gemini_api_key_masked || "••••••••••••••••");
        } else {
          setGeminiConfigured(false);
          setGeminiApiKey("");
        }

        setRazorpayKeyId(integrations.razorpay_key_id || "");

        if (integrations.razorpay_key_secret_configured) {
          setRazorpayConfigured(true);
          setRazorpayKeySecret(integrations.razorpay_key_secret_masked || "••••••••••••••••");
        } else {
          setRazorpayConfigured(false);
          setRazorpayKeySecret("");
        }

        if (integrations.razorpay_webhook_secret_configured) {
          setWebhookConfigured(true);
          setRazorpayWebhookSecret(integrations.razorpay_webhook_secret_masked || "••••••••••••••••");
        } else {
          setWebhookConfigured(false);
          setRazorpayWebhookSecret("");
        }
      } catch (err) {
        console.error("Failed to load integrations:", err);
        showError("Could not load integrations configuration.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadIntegrations();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        integrations: {
          geminiApiKey: geminiApiKey,
          gemini_api_key: geminiApiKey,
          razorpayKeyId: razorpayKeyId.trim(),
          razorpay_key_id: razorpayKeyId.trim(),
          razorpayKeySecret: razorpayKeySecret,
          razorpay_key_secret: razorpayKeySecret,
          razorpayWebhookSecret: razorpayWebhookSecret,
          razorpay_webhook_secret: razorpayWebhookSecret,
        },
      };

      const updated = await updateCurrentConsultant(payload);
      const integrations = updated?.integrations || {};

      setGeminiConfigured(Boolean(integrations.gemini_api_key_configured));
      if (integrations.gemini_api_key_configured) {
        setGeminiApiKey(integrations.gemini_api_key_masked || "••••••••••••••••");
      }

      setRazorpayKeyId(integrations.razorpay_key_id || "");
      setRazorpayConfigured(Boolean(integrations.razorpay_key_secret_configured));
      if (integrations.razorpay_key_secret_configured) {
        setRazorpayKeySecret(integrations.razorpay_key_secret_masked || "••••••••••••••••");
      }

      setWebhookConfigured(Boolean(integrations.razorpay_webhook_secret_configured));
      if (integrations.razorpay_webhook_secret_configured) {
        setRazorpayWebhookSecret(integrations.razorpay_webhook_secret_masked || "••••••••••••••••");
      }

      setShowGeminiKey(false);
      setShowRazorpaySecret(false);
      setShowWebhookSecret(false);

      showSuccess("Integrations saved successfully.");
    } catch (err) {
      console.error("Failed to save integrations:", err);
      const detail = err?.detail || err?.message || "Failed to update integrations.";
      showError(typeof detail === "string" ? detail : "Failed to update integrations.");
    } finally {
      setSaving(false);
    }
  };

  const handleClearRazorpay = () => {
    setRazorpayKeyId("");
    setRazorpayKeySecret("");
    setRazorpayWebhookSecret("");
    showInfo("Razorpay keys cleared. Click 'Save changes' to apply.");
  };

  const handleClearGemini = () => {
    setGeminiApiKey("");
    showInfo("Gemini API key cleared. Click 'Save changes' to apply.");
  };

  if (loading) {
    return (
      <div className="card settings-card" style={{ padding: "32px", textAlign: "center" }}>
        <div className="text-muted" style={{ fontSize: 14 }}>Loading integration settings...</div>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleSave}>
        {/* RAZORPAY PAYMENT GATEWAY */}
        <div className="card settings-card mb-3">
          <div className="row-sb settings-card-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div className="font-6 settings-card-title" style={{ marginBottom: 4 }}>
                Razorpay
              </div>
              <div className="text-xs text-muted">
                Accept client milestone payments directly into your Razorpay account.
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 12,
                  background: razorpayConfigured && razorpayKeyId ? "rgba(77, 255, 160, 0.12)" : "rgba(255, 255, 255, 0.06)",
                  color: razorpayConfigured && razorpayKeyId ? "#4DFFA0" : "#94A3B8",
                  border: razorpayConfigured && razorpayKeyId ? "1px solid rgba(77, 255, 160, 0.25)" : "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: razorpayConfigured && razorpayKeyId ? "#4DFFA0" : "#94A3B8",
                  }}
                />
                {razorpayConfigured && razorpayKeyId ? "Configured" : "Not configured"}
              </span>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setHelpModal("razorpay")}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  height: "auto",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#cbd5e1",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Setup guide
              </button>
            </div>
          </div>

          <div className="settings-form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="rzp-key-id">
                Key ID
              </label>
              <input
                id="rzp-key-id"
                type="text"
                className="form-input settings-input"
                placeholder="rzp_live_... or rzp_test_..."
                value={razorpayKeyId}
                onChange={(e) => setRazorpayKeyId(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              <div className="form-hint">Public Key identifier provided by Razorpay.</div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="rzp-key-secret">
                Key Secret
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="rzp-key-secret"
                  type={showRazorpaySecret ? "text" : "password"}
                  className="form-input settings-input"
                  placeholder={razorpayConfigured ? "••••••••••••••••" : "Paste Key Secret"}
                  value={razorpayKeySecret}
                  onChange={(e) => setRazorpayKeySecret(e.target.value)}
                  style={{ paddingRight: 40 }}
                  autoComplete="new-password"
                  spellCheck="false"
                />
                <button
                  type="button"
                  onClick={() => setShowRazorpaySecret((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#7ba595",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                  title={showRazorpaySecret ? "Hide secret" : "Show secret"}
                >
                  {showRazorpaySecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="form-hint">
                {razorpayConfigured
                  ? "Configured. Leave masked to keep current secret."
                  : "Private secret used for webhook and signature verification."}
              </div>
            </div>
          </div>

          <div className="form-group" style={{ maxWidth: "calc(50% - 7px)" }}>
            <label className="form-label" htmlFor="rzp-webhook-secret">
              Webhook Secret <span className="text-muted">(Optional)</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="rzp-webhook-secret"
                type={showWebhookSecret ? "text" : "password"}
                className="form-input settings-input"
                placeholder={webhookConfigured ? "••••••••••••••••" : "Optional webhook secret"}
                value={razorpayWebhookSecret}
                onChange={(e) => setRazorpayWebhookSecret(e.target.value)}
                style={{ paddingRight: 40 }}
                autoComplete="new-password"
                spellCheck="false"
              />
              <button
                type="button"
                onClick={() => setShowWebhookSecret((v) => !v)}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#7ba595",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                }}
                title={showWebhookSecret ? "Hide secret" : "Show secret"}
              >
                {showWebhookSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="form-hint">Used to verify asynchronous webhook events from Razorpay.</div>
          </div>

          {(razorpayKeyId || razorpayKeySecret) && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <button
                type="button"
                onClick={handleClearRazorpay}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: 12,
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Clear Razorpay credentials
              </button>
            </div>
          )}
        </div>

        {/* GOOGLE GEMINI AI */}
        <div className="card settings-card mb-3">
          <div className="row-sb settings-card-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div className="font-6 settings-card-title" style={{ marginBottom: 4 }}>
                Google Gemini
              </div>
              <div className="text-xs text-muted">
                Powers Brand DNA generation, proposals, moodboard directions, and studio assistant.
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 12,
                  background: geminiConfigured ? "rgba(77, 255, 160, 0.12)" : "rgba(255, 255, 255, 0.06)",
                  color: geminiConfigured ? "#4DFFA0" : "#94A3B8",
                  border: geminiConfigured ? "1px solid rgba(77, 255, 160, 0.25)" : "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: geminiConfigured ? "#4DFFA0" : "#94A3B8",
                  }}
                />
                {geminiConfigured ? "Configured" : "Not configured"}
              </span>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setHelpModal("gemini")}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  height: "auto",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#cbd5e1",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Setup guide
              </button>
            </div>
          </div>

          <div className="form-group" style={{ maxWidth: "calc(50% - 7px)" }}>
            <label className="form-label" htmlFor="gemini-key">
              API Key
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="gemini-key"
                type={showGeminiKey ? "text" : "password"}
                className="form-input settings-input"
                placeholder={geminiConfigured ? "••••••••••••••••" : "AIzaSy..."}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                style={{ paddingRight: 40 }}
                autoComplete="new-password"
                spellCheck="false"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey((v) => !v)}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#7ba595",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                }}
                title={showGeminiKey ? "Hide key" : "Show key"}
              >
                {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="form-hint">
              {geminiConfigured
                ? "Configured. Leave masked to keep current key."
                : "API key from Google AI Studio (starts with AIzaSy...)."}
            </div>
          </div>

          {geminiApiKey && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <button
                type="button"
                onClick={handleClearGemini}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: 12,
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Clear Gemini API key
              </button>
            </div>
          )}
        </div>

        {/* SUBMIT BUTTON */}
        <div style={{ marginTop: 8 }}>
          <button
            type="submit"
            className="btn btn-primary settings-save-btn"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>

      {/* SETUP GUIDE MODAL */}
      {helpModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setHelpModal(null)}
        >
          <div
            className="card settings-card"
            style={{
              maxWidth: 520,
              width: "100%",
              padding: 24,
              border: "1px solid rgba(77, 255, 160, 0.25)",
              boxShadow: "0 16px 36px rgba(0, 0, 0, 0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="font-6" style={{ fontSize: 16, color: "#f3f8f2" }}>
                {helpModal === "razorpay" ? "Razorpay Setup Guide" : "Google Gemini Setup Guide"}
              </div>
              <button
                type="button"
                onClick={() => setHelpModal(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: 10 }}>
              <button
                type="button"
                onClick={() => setHelpModal("razorpay")}
                style={{
                  background: helpModal === "razorpay" ? "rgba(255, 255, 255, 0.1)" : "transparent",
                  color: helpModal === "razorpay" ? "#f3f8f2" : "#94a3b8",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Razorpay
              </button>
              <button
                type="button"
                onClick={() => setHelpModal("gemini")}
                style={{
                  background: helpModal === "gemini" ? "rgba(255, 255, 255, 0.1)" : "transparent",
                  color: helpModal === "gemini" ? "#f3f8f2" : "#94a3b8",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Google Gemini
              </button>
            </div>

            {helpModal === "razorpay" ? (
              <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.7 }}>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Sign in to your <a href="https://dashboard.razorpay.com/" target="_blank" rel="noreferrer" style={{ color: "#4DFFA0", textDecoration: "underline" }}>Razorpay Dashboard</a>.</li>
                  <li>In the top navigation, toggle between <strong>Test Mode</strong> (for testing) or <strong>Live Mode</strong> (for real client payments).</li>
                  <li>Navigate to <strong>Account & Settings</strong> &rarr; <strong>Website and app settings</strong> &rarr; <strong>API Keys</strong>.</li>
                  <li>Click <strong>Generate Key</strong> to view your Key ID and Key Secret.</li>
                  <li>Copy both values into the fields in Floxa and click <strong>Save changes</strong>.</li>
                </ol>
                <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(255, 255, 255, 0.04)", borderRadius: 6, fontSize: 12, color: "#94a3b8" }}>
                  Note: Razorpay shows the Key Secret only once upon generation. Copy it before closing the modal.
                </div>
              </div>
            ) : (
              <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.7 }}>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: "#4DFFA0", textDecoration: "underline" }}>Google AI Studio</a>.</li>
                  <li>Sign in with your Google account.</li>
                  <li>Click <strong>Create API key</strong> and select or create a project.</li>
                  <li>Copy the generated key (starts with <code>AIzaSy</code>).</li>
                  <li>Paste it into the <strong>API Key</strong> field in Floxa and click <strong>Save changes</strong>.</li>
                </ol>
                <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(255, 255, 255, 0.04)", borderRadius: 6, fontSize: 12, color: "#94a3b8" }}>
                  Google AI Studio includes a free tier with 15 requests per minute and no credit card required.
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <a
                href={helpModal === "razorpay" ? "https://dashboard.razorpay.com/app/keys" : "https://aistudio.google.com/app/apikey"}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#4DFFA0",
                  fontSize: 12,
                  textDecoration: "underline",
                }}
              >
                {helpModal === "razorpay" ? "Open Razorpay Dashboard" : "Open Google AI Studio"} &rarr;
              </a>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setHelpModal(null)}
                style={{
                  minWidth: 70,
                  height: 32,
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
