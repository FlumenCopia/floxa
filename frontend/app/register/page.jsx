"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerConsultant } from "../../src/lib/authApi";
import { showError, showSuccess } from "../../src/lib/toast";






export default function RegisterPage() {

  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);


  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
    setErrorMessage("");
    setSuccessMessage("");
  };

  const getRegisterError = (data) => {
    if (data?.detail) {
      return data.detail;
    }

    if (data?.message) {
      return data.message;
    }

    const firstFieldError = Object.values(data || {}).flat()[0];
    if (firstFieldError) {
      return firstFieldError;
    }

    return "Registration failed. Please check your details and try again.";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      await registerConsultant(formData);

      setSuccessMessage("Registration successful. Redirecting to login...");
      showSuccess("Registration successful. Redirecting to login.");
      setTimeout(() => {
        router.push("/login");
      }, 1000);
    } catch (error) {
      console.error(error);
      const message = getRegisterError(error);
      setErrorMessage(message);
      showError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="login-screen">
      <div className="login-card">
        <div className="login-logo">FLOXA</div>
        <div className="login-tagline">Clarity Before Creation</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group mb-3">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              type="text"
              name="name"
              placeholder="Your name"
              value={formData.name}
              onChange={handleChange}
              disabled={isLoading}
              required
            />
          </div>
          <div className="form-group mb-3">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              name="email"
              placeholder="you@studio.com"
              value={formData.email}
              onChange={handleChange}
              disabled={isLoading}
              required
            />
          </div>
          <div className="form-group mb-3">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              disabled={isLoading}
              required
            />
          </div>
          {errorMessage ? <div className="login-footer">{errorMessage}</div> : null}
          {successMessage ? <div className="login-footer">{successMessage}</div> : null}
          <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={isLoading}>
            {isLoading ? "Creating account..." : "Create account"}
          </button>
        
        </form>
        <div className="auth-switch">
          <span>Already have an account?</span>
          <Link href="/login" className="signup-link">
            Sign in
          </Link>
        </div>
        <div className="login-footer">By signing up you agree to our Terms &amp; Privacy Policy</div>
      </div>
    </div>
  );
}
