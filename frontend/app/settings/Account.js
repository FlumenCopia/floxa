"use client";

import { useEffect, useState } from "react";
import { getCurrentConsultant, updateCurrentConsultant } from "../../src/lib/authApi";
import { showError, showSuccess } from "../../src/lib/toast";

export default function Account() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadAccount() {
      try {
        const consultant = await getCurrentConsultant();

        if (!isMounted) {
          return;
        }

        setFormData({
          name: consultant?.name || "",
          email: consultant?.email || "",
          company: consultant?.company || "",
          phone: consultant?.phone || "",
        });
      } catch (error) {
        console.error("Failed to load account profile:", error);
        if (isMounted) {
          setMessage("Profile could not be loaded.");
        }
      }
    }

    loadAccount();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (field, value) => {
    setFormData((currentData) => ({
      ...currentData,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setMessage("");

    try {
      const updatedConsultant = await updateCurrentConsultant({
        name: formData.name,
        company: formData.company,
        phone: formData.phone,
      });

      setFormData({
        name: updatedConsultant?.name || "",
        email: updatedConsultant?.email || "",
        company: updatedConsultant?.company || "",
        phone: updatedConsultant?.phone || "",
      });
      setMessage("Profile updated successfully.");
      showSuccess("Profile updated successfully.");
    } catch (error) {
      console.error("Failed to update account profile:", error);
      const message = error?.detail || "Profile could not be updated.";
      setMessage(message);
      showError(message);
    }
  };

  return (
    <>
      <div className="card settings-card mb-3">
        <div className="font-6 settings-card-title">Account details</div>
        <div className="settings-form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="account-name">
              Full name
            </label>
            <input
              className="form-input settings-input"
              id="account-name"
              value={formData.name}
              onChange={(event) => handleChange("name", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="account-email">
              Email
            </label>
            <input
              className="form-input settings-input"
              id="account-email"
              value={formData.email}
              readOnly
            />
            <div className="form-hint">Change via Firebase</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="account-company">
              Company
            </label>
            <input
              className="form-input settings-input"
              id="account-company"
              value={formData.company}
              onChange={(event) => handleChange("company", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="account-phone">
              Phone
            </label>
            <input
              className="form-input settings-input"
              id="account-phone"
              value={formData.phone}
              onChange={(event) => handleChange("phone", event.target.value)}
            />
          </div>
        </div>
        {message ? <div className="form-hint">{message}</div> : null}
        <button className="btn btn-primary settings-save-btn" type="button" onClick={handleSave}>
          Save changes
        </button>
      </div>

      <div className="card settings-card settings-danger-card">
        <div className="font-6 settings-card-title text-danger">Danger zone</div>
        <div className="text-sm text-muted mb-3">
          Permanently delete your account and all associated data. This action cannot be undone.
        </div>
        <button className="btn btn-danger" type="button">
          Delete account
        </button>
      </div>
    </>
  );
}
