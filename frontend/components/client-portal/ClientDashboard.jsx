"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clientPortalService } from "../../services/clientPortalService";
import { supportSocket } from "../../services/supportSocketService";
import ProtectedAssetImage from "../common/ProtectedAssetImage";
import { downloadProtectedAsset, fetchProtectedAssetBlob } from "@/lib/api";
import { Bell, CheckCircle2, Palette } from "lucide-react";

const phaseLabels = [
  "Discovery",
  "Brand DNA",
  "Moodboards",
  "Concepts",
  "Agreement",
  "Delivery",
  "Payments",
];

const phaseToPanelMap = {
  Discovery: "discovery",
  "Brand DNA": "discovery",
  Moodboards: "moodboards",
  Concepts: "concepts",
  Agreement: "agreement",
  Delivery: "delivery",
  Payments: "payments",
};

const panelTitles = {
  discovery: "Discovery Report & Brand DNA",
  moodboards: "Visual Moodboards",
  concepts: "Brand Concepts & Identity",
  agreement: "Client Agreement",
  delivery: "Deliverables & Assets",
  payments: "Project Payments",
};

const panelToDefaultStage = {
  discovery: "Discovery",
  moodboards: "Moodboards",
  concepts: "Concepts",
  agreement: "Agreement",
  delivery: "Delivery",
  payments: "Payments",
};

const FINAL_PAYMENT_REQUIRED_MESSAGE = "Final payment must be completed before downloading deliverables.";

function getAgreementStatusLabel(agreement) {
  const labels = {
    draft: "Draft",
    shared: "Draft",
    signature_requested: "Signature Requested",
    signed: "Signed / Active",
    active: "Signed / Active",
    locked: "Completed / Locked",
    completed: "Completed / Locked",
  };

  return agreement?.status_label || labels[agreement?.status] || agreement?.status || "Not available";
}

function getActivePhaseIndex(progress, workflowStatus) {
  if (workflowStatus) {
    const statusMap = {
      created: 0,
      discovery: 0,
      advance_payment: 0,
      advance_paid: 0,
      brand_dna: 1,
      moodboards: 2,
      concepts: 3,
      agreement: 4,
      deliverables: 5,
      final_paid: 6,
      delivered: 6,
    };

    if (workflowStatus in statusMap) {
      return statusMap[workflowStatus];
    }
  }

  const pct = Number(progress || 0);

  if (pct >= 100) {
    return 6;
  }

  if (pct >= 85) {
    return 6;
  }

  if (pct >= 70) {
    return 5;
  }

  if (pct >= 55) {
    return 4;
  }

  if (pct >= 40) {
    return 3;
  }

  if (pct >= 25) {
    return 2;
  }

  if (pct >= 15) {
    return 1;
  }

  return 0;
}

const conceptNotificationActions = new Set(["concept_shared", "concept_reshared", "concept_removed"]);
const RAZORPAY_CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

let razorpayCheckoutScriptPromise = null;

function loadRazorpayCheckoutScript() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Payment checkout is not available in this browser."));
  }

  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (razorpayCheckoutScriptPromise) {
    return razorpayCheckoutScriptPromise;
  }

  const existingScript = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SCRIPT}"]`);

  razorpayCheckoutScriptPromise = new Promise((resolve, reject) => {
    function handleLoad(event) {
      if (window.Razorpay) {
        resolve();
        return;
      }

      event?.target?.remove?.();
      razorpayCheckoutScriptPromise = null;
      reject(new Error("Payment checkout could not be loaded."));
    }

    function handleError(event) {
      event?.target?.remove?.();
      razorpayCheckoutScriptPromise = null;
      reject(new Error("Payment checkout could not be loaded."));
    }

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = handleLoad;
    script.onerror = handleError;
    document.body.appendChild(script);
  });

  return razorpayCheckoutScriptPromise;
}

function getPaymentTypeLabel(type) {
  const labels = {
    advance: "Advance",
    mid: "Mid",
    final: "Final",
  };

  return labels[type] || type || "Payment";
}

function getPaymentStatusLabel(status) {
  const labels = {
    locked: "Locked",
    ready: "Waiting for request",
    requested: "Payment Requested",
    paid: "Paid",
  };

  return labels[status] || status || "Locked";
}

function formatPaymentAmount(value) {
  const amount = Number(value || 0);

  if (Number.isNaN(amount)) {
    return "Rs0";
  }

  return `Rs${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

function isPayableMilestone(milestone) {
  return milestone?.status === "requested" && Number(milestone?.amount) > 0 && Boolean(milestone?.id);
}

function getRelativeTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "Just now";
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)} min ago`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)} hr ago`;
  }

  if (diffMs < 2 * day) {
    return "Yesterday";
  }

  return new Date(value).toLocaleDateString();
}

export function ClientDashboard({ project, onNext, onSignOut, onProjectRefresh }) {
  const pct = project.completionPct;
  const workflowStatus = project.workflowStatus || project.workflow_status;
  const activePhaseIndex = getActivePhaseIndex(pct, workflowStatus);
  const activePhaseLabel = pct >= 100 ? "Complete" : phaseLabels[activePhaseIndex];
  const defaultMilestoneStage = pct >= 100 ? "Complete" : phaseLabels[activePhaseIndex];
  const initialPanel = phaseToPanelMap[defaultMilestoneStage] || "moodboards";
  const [panel, setPanel] = useState(initialPanel);
  const [selectedStage, setSelectedStage] = useState(defaultMilestoneStage);
  const currentActiveStage = panel
    ? (selectedStage || panelToDefaultStage[panel] || defaultMilestoneStage)
    : defaultMilestoneStage;
  const [working, setWorking] = useState("");
  const [brandDNAReport, setBrandDNAReport] = useState(null);
  const [discoveryReport, setDiscoveryReport] = useState(null);
  const [discoveryReportLoading, setDiscoveryReportLoading] = useState(false);
  const [discoveryReportError, setDiscoveryReportError] = useState("");
  const [moodboards, setMoodboards] = useState(project.moodboards || []);
  const [moodboardsLoading, setMoodboardsLoading] = useState(false);
  const [moodboardsError, setMoodboardsError] = useState("");
  const [moodboardsMessage, setMoodboardsMessage] = useState("");
  const [feedbackMoodboardId, setFeedbackMoodboardId] = useState(null);
  const [moodboardFeedbackText, setMoodboardFeedbackText] = useState("");
  const [deliverables, setDeliverables] = useState(project.deliverables || []);
  const [deliverablesLoading, setDeliverablesLoading] = useState(false);
  const [deliverablesError, setDeliverablesError] = useState("");
  const [agreement, setAgreement] = useState(null);
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementError, setAgreementError] = useState("");
  const [signatureMethod, setSignatureMethod] = useState("typed");
  const [signerName, setSignerName] = useState("");
  const [uploadedSignature, setUploadedSignature] = useState("");
  const [hasReadAgreement, setHasReadAgreement] = useState(false);
  const [showInlineAgreement, setShowInlineAgreement] = useState(false);
  const signatureCanvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");
  const [paymentCheckoutLoadingId, setPaymentCheckoutLoadingId] = useState(null);
  const [activePaymentCheckoutId, setActivePaymentCheckoutId] = useState(null);
  const [paymentCheckoutMessage, setPaymentCheckoutMessage] = useState("");
  const [paymentCallbackData, setPaymentCallbackData] = useState(null);
  const paymentCheckoutActiveRef = useRef(false);
  const paymentVerificationActiveRef = useRef(false);
  const [signOffError, setSignOffError] = useState("");
  const [concepts, setConcepts] = useState(project.concepts || []);
  const [conceptsLoading, setConceptsLoading] = useState(false);
  const [conceptsError, setConceptsError] = useState("");
  const [conceptsMessage, setConceptsMessage] = useState("");
  const [feedbackConceptId, setFeedbackConceptId] = useState(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [confirmingMoodboardId, setConfirmingMoodboardId] = useState(null);
  const [confirmingConceptId, setConfirmingConceptId] = useState(null);
  const notificationsRef = useRef(null);
  const [activePreview, setActivePreview] = useState(null);
  const lastFocusedElementRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!confirmingMoodboardId && !confirmingConceptId) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !working) {
        setConfirmingMoodboardId(null);
        setConfirmingConceptId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmingMoodboardId, confirmingConceptId, working]);

  const openPreview = useCallback((item, type, event) => {
    if (!item?.image_url) {
      return;
    }

    if (event?.currentTarget) {
      lastFocusedElementRef.current = event.currentTarget;
    }

    setActivePreview({
      title: item.name || item.title || (type === "moodboard" ? "Moodboard Preview" : "Concept Preview"),
      imageUrl: item.image_url,
      type,
    });

    if (typeof document !== "undefined") {
      document.body.style.overflow = "hidden";
    }
  }, []);

  const closePreview = useCallback(() => {
    setActivePreview(null);

    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }

    if (lastFocusedElementRef.current) {
      try {
        lastFocusedElementRef.current.focus();
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (!activePreview) {
      return;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreview();
        return;
      }

      if (event.key === "Tab" && closeButtonRef.current) {
        const focusables = Array.from(
          document.querySelectorAll(
            '.client-preview-backdrop button, .client-preview-backdrop [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusables.length === 0) {
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePreview, closePreview]);

  const loadClientActivities = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError("");

    try {
      const response = await clientPortalService.getClientActivities();
      setNotifications(response.success ? response.data : []);
      setNotificationsError(response.success ? "" : response.error || "Unable to load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadInitialClientActivities() {
      try {
        const response = await clientPortalService.getClientActivities();

        if (!isActive) {
          return;
        }

        setNotifications(response.success ? response.data : []);
        setNotificationsError(response.success ? "" : response.error || "Unable to load notifications.");
      } finally {
        if (isActive) {
          setNotificationsLoading(false);
        }
      }
    }

    loadInitialClientActivities();

    async function checkInitialBrandDNA() {
      try {
        const [dnaRes, discRes] = await Promise.all([
          clientPortalService.getBrandDNAReport(),
          clientPortalService.getDiscoveryReport(),
        ]);
        if (isActive) {
          if (dnaRes.success && dnaRes.data) {
            setBrandDNAReport(dnaRes.data);
          }
          if (discRes.success && discRes.data) {
            setDiscoveryReport(discRes.data);
          }
        }
      } catch {
        // Brand DNA / discovery pending
      }
    }

    checkInitialBrandDNA();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (initialPanel) {
      openPanel(initialPanel, defaultMilestoneStage, false);
    }
  }, []);

  useEffect(() => {
    const portalToken = project?.portal_token || project?.portalToken;
    if (!portalToken) return;

    supportSocket.connect({ portalToken });

    const unsubscribeNotif = supportSocket.on("notification", (newActivity) => {
      if (!newActivity) return;

      setNotifications((current) => {
        const exists = current.some((n) => n.id === newActivity.id);
        if (exists) {
          return current.map((n) => (n.id === newActivity.id ? newActivity : n));
        }
        return [newActivity, ...current];
      });

      if (newActivity.description) {
        const notifId = newActivity.id || newActivity._id || newActivity.description;
        showSuccess(newActivity.description, { toastId: `notif-${notifId}` });
      }

      if (typeof onProjectRefresh === "function") {
        onProjectRefresh();
      }
    });

    return () => {
      unsubscribeNotif();
    };
  }, [project?.portal_token, project?.portalToken, onProjectRefresh]);

  useEffect(() => {
    if (!notificationsOpen) {
      return undefined;
    }

    function closeOnOutsideClick(event) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  function selectMoodboard(moodboardOrId) {
    const id = typeof moodboardOrId === "object" && moodboardOrId !== null ? moodboardOrId.id : moodboardOrId;
    setFeedbackMoodboardId(null);
    setConfirmingMoodboardId(id);
  }

  async function executeSelectMoodboard(id) {
    setWorking(id);
    setMoodboardsError("");
    setMoodboardsMessage("");

    const token = project?.portal_token || project?.portalToken || project?.token;

    try {
      const response = await clientPortalService.selectMoodboard(id, token);
      const selectedId = response.data?.id ?? id;

      setMoodboards((currentMoodboards) =>
        currentMoodboards.map((item) =>
          item.id === selectedId
            ? {
              ...item,
              clientSelected: true,
              is_selected: true,
            }
            : item
        )
      );
      setMoodboardsMessage("Visual direction selected.");
      await onProjectRefresh?.();
      setConfirmingMoodboardId(null);
    } catch (error) {
      setMoodboardsError(error?.detail || "Unable to select moodboard. Please try again.");
    } finally {
      setWorking("");
    }
  }

  function openMoodboardFeedback(id) {
    setConfirmingMoodboardId(null);
    setFeedbackMoodboardId(id);
    setMoodboardFeedbackText("");
    setMoodboardsError("");
    setMoodboardsMessage("");
  }

  async function submitMoodboardChanges(id) {
    const feedback = moodboardFeedbackText.trim();
    if (!feedback) {
      setMoodboardsError("Please enter feedback before requesting changes.");
      return;
    }

    setWorking(id);
    setMoodboardsError("");
    setMoodboardsMessage("");

    const token = project?.portal_token || project?.portalToken || project?.token;

    try {
      await clientPortalService.submitMoodboardFeedback(id, { feedback }, token);
      setMoodboards((currentMoodboards) =>
        currentMoodboards.map((item) =>
          item.id === id
            ? {
              ...item,
              clientFeedback: feedback,
              client_feedback: feedback,
              clientSelected: false,
              is_selected: false,
            }
            : item
        )
      );
      await onProjectRefresh?.();
      setFeedbackMoodboardId(null);
      setMoodboardFeedbackText("");
      setMoodboardsMessage("Change request sent to consultant.");
    } catch (error) {
      setMoodboardsError(error?.detail || "Unable to send feedback. Please try again.");
    } finally {
      setWorking("");
    }
  }

  async function downloadAgreement() {
    if (!agreement?.file_url) {
      window.alert("Agreement file is not available.");
      return;
    }

    setWorking("agreement");

    try {
      await downloadProtectedAsset(
        agreement.file_url,
        `${agreement.title || "agreement"}.pdf`
      );
    } catch (error) {
      const status = error?.status;
      let userMessage = "Unable to download agreement PDF.";

      if (status === 401 || status === 403) {
        userMessage = "Authentication failure: You are not authorized to download this agreement.";
      } else if (status === 404) {
        userMessage = "Agreement PDF file not found.";
      } else if (status === 503) {
        userMessage = "Storage service is temporarily unavailable. Please try again later.";
      } else if (error?.detail) {
        userMessage = error.detail;
      }

      window.alert(userMessage);
    } finally {
      setWorking("");
    }
  }

  async function previewAgreement() {
    if (!agreement?.file_url) {
      window.alert("Agreement file is not available.");
      return;
    }

    const newTab = window.open("about:blank", "_blank");

    if (!newTab) {
      window.alert("Popup was blocked by your browser. Please allow popups for this site to view the agreement PDF.");
      return;
    }

    newTab.opener = null;

    setWorking("agreement");

    try {
      const { blob, contentType } = await fetchProtectedAssetBlob(agreement.file_url);
      const pdfBlob = blob?.type === "application/pdf"
        ? blob
        : new Blob([blob], { type: contentType || "application/pdf" });
      const objectUrl = URL.createObjectURL(pdfBlob);

      newTab.location.href = objectUrl;

      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 60000);
    } catch (error) {
      if (newTab && !newTab.closed) {
        newTab.close();
      }

      const status = error?.status;
      let userMessage = "Unable to open agreement PDF.";

      if (status === 401 || status === 403) {
        userMessage = "Authentication failure: You are not authorized to view this agreement.";
      } else if (status === 404) {
        userMessage = "Agreement PDF file not found.";
      } else if (status === 503) {
        userMessage = "Storage service is temporarily unavailable. Please try again later.";
      } else if (error?.detail) {
        userMessage = error.detail;
      }

      window.alert(userMessage);
    } finally {
      setWorking("");
    }
  }

  function getCanvasPoint(event) {
    const canvas = signatureCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;

    return {
      x: source.clientX - rect.left,
      y: source.clientY - rect.top,
    };
  }

  function startDrawingSignature(event) {
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return;
    }

    drawingRef.current = true;
    const context = canvas.getContext("2d");
    const point = getCanvasPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function drawSignature(event) {
    if (!drawingRef.current || !signatureCanvasRef.current) {
      return;
    }

    event.preventDefault();
    const context = signatureCanvasRef.current.getContext("2d");
    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.lineCap = "round";
    context.stroke();
  }

  function stopDrawingSignature() {
    drawingRef.current = false;
  }

  function clearDrawnSignature() {
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  function readSignatureUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      setUploadedSignature("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setUploadedSignature(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function signAgreement() {
    if (!agreement?.isProjectAgreement) {
      setAgreementError("Agreement is not ready for signing.");
      return;
    }

    if (!signerName.trim()) {
      setAgreementError("Enter your full legal name before signing.");
      return;
    }

    if (!hasReadAgreement) {
      setAgreementError("Confirm that you have read and agree to the agreement.");
      return;
    }

    const drawnSignature = signatureCanvasRef.current?.toDataURL("image/png") || "";
    const signatureImage = signatureMethod === "drawn"
      ? drawnSignature
      : signatureMethod === "uploaded"
        ? uploadedSignature
        : "";

    if ((signatureMethod === "drawn" || signatureMethod === "uploaded") && !signatureImage) {
      setAgreementError("Add your signature before confirming.");
      return;
    }

    setWorking("agreement-sign");
    setAgreementError("");

    try {
      const response = await clientPortalService.signAgreement({
        signer_name: signerName.trim(),
        signature_method: signatureMethod,
        signature_image: signatureImage,
        has_read_agreement: hasReadAgreement,
        signature_metadata: {
          method_label: signatureMethod,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        },
      });

      if (response.success) {
        setAgreement(response.data);
        await loadClientActivities();
      } else {
        setAgreementError(response.error || "Unable to sign agreement.");
      }
    } catch (error) {
      setAgreementError(error instanceof Error ? error.message : "Unable to sign agreement.");
    } finally {
      setWorking("");
    }
  }

  async function refreshConcepts() {
    const response = await clientPortalService.getConcepts();
    setConcepts(response.success ? response.data : []);
    setConceptsError(response.success ? "" : response.error || "Concepts are not ready yet.");
  }

  function approveConcept(conceptOrId) {
    const id = typeof conceptOrId === "object" && conceptOrId !== null ? conceptOrId.id : conceptOrId;
    setFeedbackConceptId(null);
    setConfirmingConceptId(id);
  }

  async function executeApproveConcept(id) {
    setWorking(id);
    setConceptsError("");
    setConceptsMessage("");

    try {
      await clientPortalService.submitConceptFeedback(id, { action: "approved" });
      await refreshConcepts();
      await onProjectRefresh?.();
      setConceptsMessage("Concept approved.");
      setConfirmingConceptId(null);
    } catch (error) {
      setConceptsError(error?.detail || "Unable to approve concept. Please try again.");
    } finally {
      setWorking("");
    }
  }

  function openConceptFeedback(id) {
    setConfirmingConceptId(null);
    setFeedbackConceptId(id);
    setFeedbackText("");
    setConceptsError("");
    setConceptsMessage("");
  }

  async function submitConceptChanges(id) {
    const feedback = feedbackText.trim();

    if (!feedback) {
      setConceptsError("Please enter feedback before requesting changes.");
      return;
    }

    setWorking(id);
    setConceptsError("");
    setConceptsMessage("");

    try {
      await clientPortalService.submitConceptFeedback(id, {
        action: "changes_requested",
        feedback,
      });
      await refreshConcepts();
      await onProjectRefresh?.();
      setFeedbackConceptId(null);
      setFeedbackText("");
      setConceptsMessage("Change request sent.");
    } catch (error) {
      setConceptsError(error?.detail || "Unable to send feedback. Please try again.");
    } finally {
      setWorking("");
    }
  }

  async function startPaymentCheckout(milestone) {
    if (!isPayableMilestone(milestone) || paymentCheckoutActiveRef.current) {
      return;
    }

    paymentCheckoutActiveRef.current = true;
    setPaymentCheckoutLoadingId(milestone.id);
    setActivePaymentCheckoutId(milestone.id);
    setPaymentsError("");
    setPaymentCheckoutMessage("");
    setPaymentCallbackData(null);

    try {
      const orderResponse = await clientPortalService.createPaymentOrder(milestone.id);

      if (!orderResponse.success) {
        setPaymentsError(orderResponse.error || "Unable to start payment checkout.");
        setPaymentCheckoutLoadingId(null);
        setActivePaymentCheckoutId(null);
        paymentCheckoutActiveRef.current = false;
        return;
      }

      await loadRazorpayCheckoutScript();

      if (!window.Razorpay) {
        setPaymentsError("Payment checkout could not be loaded.");
        setPaymentCheckoutLoadingId(null);
        setActivePaymentCheckoutId(null);
        paymentCheckoutActiveRef.current = false;
        return;
      }

      const order = orderResponse.data;
      const paymentLabel = getPaymentTypeLabel(order?.milestone?.type || milestone.type);
      let checkoutCompleted = false;
      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.razorpay_order_id,
        name: "FLOXA",
        description: `${paymentLabel} Payment`,
        prefill: project.clientEmail ? { email: project.clientEmail } : undefined,
        handler: async (response) => {
          checkoutCompleted = true;
          const callbackData = {
            milestoneId: milestone.id,
            razorpay_payment_id: response?.razorpay_payment_id || "",
            razorpay_order_id: response?.razorpay_order_id || "",
            razorpay_signature: response?.razorpay_signature || "",
          };

          await verifyPaymentCallback(callbackData);
        },
        modal: {
          ondismiss: () => {
            if (checkoutCompleted) {
              return;
            }

            setPaymentCheckoutMessage("Payment checkout closed. You can try again when ready.");
            setPaymentCheckoutLoadingId(null);
            setActivePaymentCheckoutId(null);
            paymentCheckoutActiveRef.current = false;
          },
        },
      });

      checkout.on("payment.failed", () => {
        checkoutCompleted = true;
        setPaymentsError("Payment failed. Please try again.");
        setPaymentCheckoutLoadingId(null);
        setActivePaymentCheckoutId(null);
        paymentCheckoutActiveRef.current = false;
      });

      checkout.open();
      setPaymentCheckoutLoadingId(null);
    } catch (error) {
      setPaymentsError(error instanceof Error ? error.message : "Unable to start payment checkout.");
      setPaymentCheckoutLoadingId(null);
      setActivePaymentCheckoutId(null);
      paymentCheckoutActiveRef.current = false;
    }
  }

  async function refreshClientPayments() {
    const response = await clientPortalService.getClientPayments();
    setPayments(response.success ? response.data : []);
    setPaymentsError(response.success ? "" : response.error || "Payments are not available yet.");
    return response;
  }

  async function verifyPaymentCallback(callbackData) {
    if (paymentVerificationActiveRef.current) {
      return;
    }

    const hasRequiredFields = Boolean(
      callbackData?.razorpay_order_id &&
      callbackData?.razorpay_payment_id &&
      callbackData?.razorpay_signature
    );

    if (!hasRequiredFields) {
      setPaymentsError("Payment could not be confirmed because Razorpay did not return complete verification details.");
      setPaymentCheckoutMessage("");
      setPaymentCallbackData(callbackData || null);
      setPaymentCheckoutLoadingId(null);
      setActivePaymentCheckoutId(null);
      paymentCheckoutActiveRef.current = false;
      return;
    }

    paymentVerificationActiveRef.current = true;
    paymentCheckoutActiveRef.current = true;
    setPaymentCallbackData(callbackData);
    setPaymentCheckoutLoadingId(callbackData.milestoneId || null);
    setActivePaymentCheckoutId(callbackData.milestoneId || null);
    setPaymentsError("");
    setPaymentCheckoutMessage("Verifying payment...");

    try {
      const verifyResponse = await clientPortalService.verifyPayment(callbackData);

      if (!verifyResponse.success) {
        setPaymentsError(
          verifyResponse.error ||
          "Payment could not be confirmed yet. Please retry verification or refresh the page."
        );
        setPaymentCheckoutMessage("");
        return;
      }

      await refreshClientPayments();
      await onProjectRefresh?.();
      await loadClientActivities();
      setPaymentCallbackData(null);
      setPaymentCheckoutMessage("Payment verified successfully.");
    } catch {
      setPaymentsError("Payment could not be confirmed yet. Please retry verification or refresh the page.");
      setPaymentCheckoutMessage("");
    } finally {
      paymentVerificationActiveRef.current = false;
      paymentCheckoutActiveRef.current = false;
      setPaymentCheckoutLoadingId(null);
      setActivePaymentCheckoutId(null);
    }
  }

  function handleStageClick(label) {
    setSelectedStage(label);
    const targetPanel = phaseToPanelMap[label];
    if (targetPanel) {
      openPanel(targetPanel, label, true);
    }
  }

  async function openPanel(nextPanel, stageLabel, shouldScroll = false) {
    setPanel(nextPanel);
    if (stageLabel) {
      setSelectedStage(stageLabel);
    } else {
      setSelectedStage(panelToDefaultStage[nextPanel] || null);
    }
    setSignOffError("");

    if (shouldScroll) {
      setTimeout(() => {
        const panelEl = document.getElementById("client-workspace-panel");
        if (panelEl) {
          panelEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }

    const token = project?.portal_token || project?.portalToken || project?.token;

    if (nextPanel === "moodboards") {
      setMoodboardsLoading(true);
      setMoodboardsError("");
      setMoodboardsMessage("");
      setFeedbackMoodboardId(null);
      setMoodboardFeedbackText("");

      try {
        const response = await clientPortalService.getMoodboards(token);
        setMoodboards(response.success ? response.data : []);
        setMoodboardsError(response.success ? "" : response.error || "Moodboards are not ready yet.");
      } finally {
        setMoodboardsLoading(false);
      }

      return;
    }

    if (nextPanel === "concepts") {
      setConceptsLoading(true);
      setConceptsError("");
      setConceptsMessage("");
      setFeedbackConceptId(null);

      try {
        await refreshConcepts();
      } finally {
        setConceptsLoading(false);
      }

      return;
    }

    if (nextPanel === "delivery") {
      setDeliverablesLoading(true);
      setDeliverablesError("");
      setPaymentsLoading(true);
      setPaymentsError("");

      try {
        const response = await clientPortalService.getClientDeliverables(token);
        setDeliverables(response.success ? response.data : []);
        setDeliverablesError(response.success ? "" : response.error || "Deliverables are not ready yet.");
      } finally {
        setDeliverablesLoading(false);
      }

      try {
        const response = await clientPortalService.getClientPayments(token);
        setPayments(response.success ? response.data : []);
        setPaymentsError(response.success ? "" : response.error || "Payments are not available yet.");
      } finally {
        setPaymentsLoading(false);
      }

      return;
    }

    if (nextPanel === "agreement") {
      setAgreementLoading(true);
      setAgreementError("");

      try {
        const response = await clientPortalService.getClientAgreement(token);
        setAgreement(response.success ? response.data : null);
        setAgreementError(response.success ? "" : response.error || "Agreement is being prepared.");
      } finally {
        setAgreementLoading(false);
      }

      return;
    }

    if (nextPanel === "payments") {
      setPaymentsLoading(true);
      setPaymentsError("");
      setPaymentCheckoutMessage("");
      setPaymentCallbackData(null);

      try {
        const response = await clientPortalService.getClientPayments(token);
        setPayments(response.success ? response.data : []);
        setPaymentsError(response.success ? "" : response.error || "Payments are not available yet.");
      } finally {
        setPaymentsLoading(false);
      }

      return;
    }

    if (nextPanel !== "discovery") {
      return;
    }

    setDiscoveryReportLoading(true);
    setDiscoveryReportError("");

    try {
      const [discRes, dnaRes] = await Promise.all([
        clientPortalService.getDiscoveryReport(token),
        clientPortalService.getBrandDNAReport(token),
      ]);

      setDiscoveryReport(discRes.success ? discRes.data : null);
      setDiscoveryReportError(discRes.success ? "" : discRes.error || "Unable to load discovery report.");
      setBrandDNAReport(dnaRes.success ? dnaRes.data : null);
    } finally {
      setDiscoveryReportLoading(false);
    }
  }

  async function handleSignOff() {
    setWorking("sign-off");
    setSignOffError("");

    try {
      const response = await clientPortalService.signOffProject();

      if (!response.success) {
        setSignOffError(response.error || "Unable to complete project sign-off.");
        return;
      }

      await onProjectRefresh?.();
    } catch (error) {
      setSignOffError(error instanceof Error ? error.message : "Unable to complete project sign-off.");
    } finally {
      setWorking("");
    }
  }

  const visibleNotifications = notifications.slice(0, 5);
  const unreadCount = notifications.filter((item) => item.client_is_read === false).length;
  const hasSharedDelivery = deliverables.some((item) => item.status === "shared" || item.file_url || item.fileUrl);
  const allPaymentsPaid = payments.length > 0 && payments.every((item) => item.status === "paid");
  const signOffDisabledReason = !hasSharedDelivery
    ? "Final delivery is not available yet."
    : !allPaymentsPaid
      ? paymentsLoading
        ? "Checking payment status..."
        : "All payments must be paid before sign-off."
      : "";

  function toggleNotifications() {
    const shouldOpen = !notificationsOpen;
    setNotificationsOpen(shouldOpen);

    if (shouldOpen && !notifications.length && !notificationsLoading) {
      loadClientActivities();
    }

    if (shouldOpen && unreadCount > 0) {
      markClientNotificationsRead();
    }
  }

  function openNotification(notification) {
    if (conceptNotificationActions.has(notification.action)) {
      setNotificationsOpen(false);
      openPanel("concepts");
    }
  }

  async function markClientNotificationsRead() {
    try {
      const response = await clientPortalService.markClientActivitiesRead();

      if (!response.success) {
        return;
      }

      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.client_is_read === false
            ? {
              ...notification,
              client_is_read: true,
              client_read_at: new Date().toISOString(),
            }
            : notification
        )
      );
    } catch (error) {
      console.warn("Unable to mark client notifications as read.", error);
    }
  }

  const hasSelectedMoodboard = moodboards.some((m) => m.clientSelected || m.is_selected);

  return (
    <div className="client-dashboard-screen">
      <header className="client-dashboard-header">
        <div>
          <div className="client-dashboard-wordmark">
            <img src="/image/FLOXA_log.png" alt="FLOXA" className="client-dashboard-logo-img" />
          </div>
          <p>Welcome back, {project.brandDNA?.clientName ?? "Client"}.</p>
        </div>
        <div className="client-dashboard-actions">
          <div className="client-notification-wrap" ref={notificationsRef}>
            <button
              type="button"
              className="client-notification-button"
              aria-label="Open notifications"
              aria-expanded={notificationsOpen}
              onClick={toggleNotifications}
            >
              <span className="client-notification-icon" aria-hidden="true">
                <Bell size={22} strokeWidth={2} />
              </span>
              {unreadCount > 0 ? <span className="client-notification-count">{unreadCount}</span> : null}
            </button>
            {notificationsOpen ? (
              <div className="client-notification-dropdown">
                <div className="client-notification-head">
                  <div>
                    <strong>Notifications</strong>
                    <span>{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</span>
                  </div>
                  <button type="button" onClick={loadClientActivities}>
                    Refresh
                  </button>
                </div>
                <div className="client-notification-list">
                  {notificationsLoading ? (
                    <div className="client-notification-empty">Loading notifications...</div>
                  ) : null}
                  {!notificationsLoading && notificationsError ? (
                    <div className="client-notification-empty">{notificationsError}</div>
                  ) : null}
                  {!notificationsLoading && !notificationsError && visibleNotifications.length === 0 ? (
                    <div className="client-notification-empty">
                      <strong>No notifications yet.</strong>
                      <span>Your consultant updates will appear here.</span>
                    </div>
                  ) : null}
                  {!notificationsLoading && !notificationsError && visibleNotifications.map((notification) => (
                    <button
                      type="button"
                      key={notification.id}
                      className={`client-notification-item ${notification.client_is_read === false ? "unread" : ""
                        }`}
                      onClick={() => openNotification(notification)}
                    >
                      <span className="client-notification-dot" />
                      <span>
                        <strong>{notification.description}</strong>
                        <small>{getRelativeTime(notification.created_at)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={() => onNext?.("profile")}>
            Edit profile
          </button>
          <button type="button" onClick={() => onProjectRefresh?.()}>
            Refresh
          </button>
          <button type="button" onClick={() => onSignOut?.()}>
            Sign out
          </button>
        </div>
      </header>

      <section className="client-dashboard-hero">
        <div className="client-dashboard-orb" style={{ "--client-progress": `${pct * 3.6}deg` }}>
          <div>
            <strong>{pct}%</strong>
            <span>complete</span>
          </div>
        </div>

        <div className="client-dashboard-project">
          <span className="client-dashboard-kicker">Your brand journey</span>
          <h1>{project.name}</h1>
          <p>
            Phase {activePhaseIndex + 1} of {phaseLabels.length} -{" "}
            {activePhaseLabel}
          </p>
          <div className="client-dashboard-progress">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="client-dashboard-stage-list" role="navigation" aria-label="Project stages">
          {phaseLabels.map((label, index) => {
            const isActive = currentActiveStage === label;
            const isComplete = !isActive && index < activePhaseIndex;

            return (
              <button
                key={label}
                type="button"
                className={`client-dashboard-stage-item ${isActive ? "active" : isComplete ? "complete" : ""
                  }`.trim()}
                onClick={() => handleStageClick(label)}
                title={`Open ${label} workspace`}
                aria-current={isActive ? "step" : undefined}
              >
                <span />
                {pct >= 100 && index === phaseLabels.length - 1 ? "Complete" : label}
              </button>
            );
          })}
        </div>
      </section>

      {panel ? (
        <section id="client-workspace-panel" className="client-dashboard-panel client-design-enter">
          <div className="client-panel-heading">
            <div>
              <span>Project workspace</span>
              <h2>{panelTitles[panel] || panel}</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setPanel(null);
                setSelectedStage(null);
              }}
            >
              Close
            </button>
          </div>

          {panel === "discovery" ? (
            <div className="client-brand-summary">
              {discoveryReportLoading ? (
                <>
                  <h3>Loading discovery report...</h3>
                  <p>Your brand report and strategy are being fetched.</p>
                </>
              ) : brandDNAReport ? (
                <>
                  <div className="client-discovery-report-header">
                    <span>Brand DNA & Strategy</span>
                    <h3>{brandDNAReport.brand_personality_cluster || "Brand DNA Analysis"}</h3>
                    {discoveryReport?.submitted_at || discoveryReport?.submittedAt ? (
                      <small className="client-badge-submitted">
                        Discovery submitted on {new Date(discoveryReport.submitted_at || discoveryReport.submittedAt).toLocaleDateString()}
                      </small>
                    ) : null}
                  </div>

                  <div className="client-discovery-details-grid" style={{ marginBottom: "2rem" }}>
                    {brandDNAReport.positioning_summary ? (
                      <div className="client-discovery-detail-item full-width">
                        <strong>Positioning Strategy</strong>
                        <p>{brandDNAReport.positioning_summary}</p>
                      </div>
                    ) : null}

                    {brandDNAReport.business_summary ? (
                      <div className="client-discovery-detail-item">
                        <strong>Business & Mission Summary</strong>
                        <p>{brandDNAReport.business_summary}</p>
                      </div>
                    ) : null}

                    {brandDNAReport.target_audience_summary ? (
                      <div className="client-discovery-detail-item">
                        <strong>Target Audience Summary</strong>
                        <p>{brandDNAReport.target_audience_summary}</p>
                      </div>
                    ) : null}

                    {brandDNAReport.brand_feeling_summary ? (
                      <div className="client-discovery-detail-item">
                        <strong>Brand Feeling Summary</strong>
                        <p>{brandDNAReport.brand_feeling_summary}</p>
                      </div>
                    ) : null}

                    {brandDNAReport.visual_direction_summary ? (
                      <div className="client-discovery-detail-item">
                        <strong>Visual Direction Summary</strong>
                        <p>{brandDNAReport.visual_direction_summary}</p>
                      </div>
                    ) : null}

                    {brandDNAReport.competitor_summary ? (
                      <div className="client-discovery-detail-item full-width">
                        <strong>Competitor Analysis</strong>
                        <p>{brandDNAReport.competitor_summary}</p>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div style={{ padding: "2.5rem 1rem", textAlign: "center" }}>
                  <div className="client-discovery-report-header" style={{ marginBottom: "1.5rem" }}>
                    <span>Discovery Status</span>
                    <h3>Under Consultant Review</h3>
                    {discoveryReport?.submitted_at || discoveryReport?.submittedAt ? (
                      <small className="client-badge-submitted">
                        Submitted on {new Date(discoveryReport.submitted_at || discoveryReport.submittedAt).toLocaleDateString()}
                      </small>
                    ) : null}
                  </div>
                  <p style={{ color: "#94a3b8", fontSize: "1.05rem", lineHeight: "1.6", maxWidth: "560px", margin: "0 auto 1.5rem" }}>
                    Your discovery answers have been successfully submitted. Your consultant is currently reviewing your inputs and generating your synthesized <strong>Brand DNA</strong> and strategy report.
                  </p>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "8px", padding: "10px 18px", color: "#38bdf8", fontSize: "0.9rem" }}>
                    <span>⏳</span> Brand DNA report will be available here once generated by your consultant.
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {panel === "moodboards" ? (
            <div className="client-panel-grid">
              {moodboardsLoading ? (
                <article className="empty-state">
                  <h3>Loading moodboards...</h3>
                  <p>Your consultant&apos;s visual directions are being fetched.</p>
                </article>
              ) : null}
              {!moodboardsLoading && moodboardsMessage ? (
                <article className="client-panel-status-banner success">
                  <p>{moodboardsMessage}</p>
                </article>
              ) : null}
              {!moodboardsLoading && moodboardsError && moodboards.length > 0 ? (
                <article className="client-panel-status-banner error">
                  <p>{moodboardsError}</p>
                </article>
              ) : null}
              {!moodboardsLoading && moodboards.length === 0 ? (
                <article className="empty-state">
                  <h3>No moodboards yet</h3>
                  <p>{moodboardsError || "Your consultant is preparing visual directions."}</p>
                </article>
              ) : null}
              {!moodboardsLoading &&
                moodboards.map((item) => {
                  const isThisSelected = item.clientSelected || item.is_selected;

                  return (
                    <article key={item.id} className={`client-moodboard-card ${isThisSelected ? "selected" : ""}`.trim()}>
                      <div className="client-moodboard-media-wrap">
                        <ProtectedAssetImage
                          src={item.image_url}
                          asBackground
                          className={`client-panel-image ${item.image_url ? "clickable" : ""}`.trim()}
                          role={item.image_url ? "button" : undefined}
                          tabIndex={item.image_url ? 0 : undefined}
                          aria-label={item.image_url ? `Enlarge preview for ${item.name || item.title || "moodboard"}` : undefined}
                          onClick={(event) => {
                            if (item.image_url) {
                              openPreview(item, "moodboard", event);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (item.image_url && (event.key === "Enter" || event.key === " ")) {
                              event.preventDefault();
                              openPreview(item, "moodboard", event);
                            }
                          }}
                          onContextMenu={(event) => event.preventDefault()}
                          style={{ userSelect: "none", WebkitUserDrag: "none" }}
                          fallbackText="No image preview"
                        />
                        {isThisSelected ? (
                          <div className="client-moodboard-selected-pill">
                            <span className="dot" /> Selected Direction
                          </div>
                        ) : null}
                      </div>

                      {confirmingMoodboardId === item.id ? (
                        <div className="client-inline-confirm-box">
                          <div className="client-inline-confirm-content">
                            <div className="client-inline-confirm-header">
                              <Palette size={16} strokeWidth={2.2} color="#4dffa0" />
                              <span>Select Visual Direction</span>
                            </div>
                            <p className="client-inline-confirm-text">
                              Are you sure you want to select &ldquo;{item.name || item.title || "this moodboard"}&rdquo;? Once selected, this decision cannot be undone. (You can select multiple moodboards)
                            </p>
                          </div>
                          <div className="client-inline-confirm-actions">
                            <button
                              type="button"
                              className="client-panel-action secondary"
                              disabled={Boolean(working)}
                              onClick={() => setConfirmingMoodboardId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="client-panel-action client-inline-confirm-btn-confirm"
                              disabled={Boolean(working)}
                              onClick={() => executeSelectMoodboard(item.id)}
                            >
                              {working === item.id ? "Saving..." : "Confirm Selection"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "8px", width: "100%", marginTop: "auto" }}>
                          <div className="client-moodboard-card-body">
                            <div className="client-moodboard-header-row">
                              <h3>{item.name || item.title}</h3>
                            </div>

                            {item.description ? (
                              <p className="client-moodboard-description">{item.description}</p>
                            ) : null}

                            {item.client_feedback ? (
                              <div className="client-feedback-badge">
                                <strong>Requested changes:</strong> {item.client_feedback}
                              </div>
                            ) : null}

                            <div className="client-moodboard-actions">
                              {isThisSelected ? (
                                <button
                                  type="button"
                                  disabled
                                  className="client-panel-action is-selected"
                                >
                                  ✓ Selected Direction
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={working === item.id}
                                  onClick={() => selectMoodboard(item)}
                                  className="client-panel-action"
                                  style={{ flex: 1 }}
                                >
                                  {working === item.id
                                    ? "Saving..."
                                    : "Select direction"}
                                  onClick={() => selectMoodboard(item.id)}
                                  className="client-panel-action primary"
                            >
                                  {working === item.id
                                    ? "Saving..."
                                    : hasSelectedMoodboard
                                      ? "Switch to this"
                                      : "Select direction"}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={working === item.id || isThisSelected}
                                onClick={() => openMoodboardFeedback(item.id)}
                                className="client-panel-action secondary"
                                style={{ flex: 1 }}
                                disabled={working === item.id}
                                onClick={() => openMoodboardFeedback(item.id)}
                                className="client-panel-action secondary"
                              >
                                Request changes
                              </button>
                            </div>
                      )}
                          </div>

                          {feedbackMoodboardId === item.id ? (
                            <div className="client-concept-feedback-box" style={{ width: "100%", marginTop: "14px" }}>
                              <textarea
                                value={moodboardFeedbackText}
                                onChange={(event) => setMoodboardFeedbackText(event.target.value)}
                                placeholder="Tell your consultant what to refine or change in this visual direction..."
                                rows={3}
                              />
                              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                                <button
                                  type="button"
                                  disabled={working === item.id}
                                  onClick={() => submitMoodboardChanges(item.id)}
                                  className="client-panel-action primary"
                                >
                                  {working === item.id ? "Sending..." : "Send feedback"}
                                </button>
                                <button
                                  type="button"
                                  disabled={working === item.id}
                                  onClick={() => setFeedbackMoodboardId(null)}
                                  className="client-panel-action secondary"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                })}
                    </div>
                  ) : null}

              {panel === "concepts" ? (
                <div className="client-panel-stack">
                  {conceptsLoading ? (
                    <article>
                      <h3>Loading concepts...</h3>
                      <p>Your consultant&apos;s design concepts are being fetched.</p>
                    </article>
                  ) : null}
                  {!conceptsLoading && concepts.length === 0 ? (
                    <article>
                      <h3>Concepts are being prepared.</h3>
                      <p>{conceptsError || "Your consultant will share design concepts here."}</p>
                    </article>
                  ) : null}
                  {!conceptsLoading && conceptsError && concepts.length > 0 ? (
                    <article>
                      <p>{conceptsError}</p>
                    </article>
                  ) : null}
                  {!conceptsLoading && conceptsMessage ? (
                    <article>
                      <p>{conceptsMessage}</p>
                    </article>
                  ) : null}
                  {!conceptsLoading && concepts.map((item) => (
                    <article key={item.id}>
                      {item.image_url ? (
                        <ProtectedAssetImage
                          src={item.image_url}
                          asBackground
                          className="client-panel-image clickable"
                          role="button"
                          tabIndex={0}
                          aria-label={`Enlarge preview for ${item.title || "concept"}`}
                          onClick={(event) => openPreview(item, "concept", event)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openPreview(item, "concept", event);
                            }
                          }}
                          onContextMenu={(event) => event.preventDefault()}
                          style={{ userSelect: "none", WebkitUserDrag: "none" }}
                          fallbackText="No image preview"
                        />
                      ) : null}
                      <h3>{item.title}</h3>
                      {item.description ? <p>{item.description}</p> : null}
                      <p>
                        Version {item.version || 1} - {item.status || "shared"}
                        {item.created_at ? ` - ${new Date(item.created_at).toLocaleDateString()}` : ""}
                      </p>
                      {item.status === "changes_requested" && item.client_feedback ? (
                        <p>Latest feedback: {item.client_feedback}</p>
                      ) : null}
                      {item.file_url ? (
                        <div>
                          <button
                            type="button"
                            className="client-panel-action"
                            onClick={() => downloadProtectedAsset(item.file_url, `concept-file-${item.id}`)}
                          >
                            View file
                          </button>
                        </div>
                      ) : null}
                      {confirmingConceptId === item.id ? (
                        <div className="client-inline-confirm-box" style={{ marginTop: "8px" }}>
                          <div className="client-inline-confirm-content">
                            <div className="client-inline-confirm-header">
                              <CheckCircle2 size={16} strokeWidth={2.2} color="#4dffa0" />
                              <span>Approve Concept</span>
                            </div>
                            <p className="client-inline-confirm-text">
                              Are you sure you want to approve &ldquo;{item.title || "this concept"}&rdquo;? Once approved, this decision cannot be undone. (You can approve multiple concepts)
                            </p>
                          </div>
                          <div className="client-inline-confirm-actions">
                            <button
                              type="button"
                              className="client-panel-action secondary"
                              disabled={Boolean(working)}
                              onClick={() => setConfirmingConceptId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="client-panel-action client-inline-confirm-btn-confirm"
                              disabled={Boolean(working)}
                              onClick={() => executeApproveConcept(item.id)}
                            >
                              {working === item.id ? "Saving..." : "Confirm Approval"}
                            </button>
                          </div>
                        </div>
                      ) : item.status === "approved" ? (
                        <div>
                          <button type="button" className="client-panel-action" disabled>
                            Approved
                          </button>
                        </div>
                      ) : (
                        <div>
                          <button
                            type="button"
                            disabled={working === item.id}
                            onClick={() => approveConcept(item)}
                            className="client-panel-action"
                          >
                            {working === item.id ? "Saving..." : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={working === item.id}
                            onClick={() => openConceptFeedback(item.id)}
                            className="client-panel-action secondary"
                          >
                            Request changes
                          </button>
                        </div>
                      )}
                      {feedbackConceptId === item.id ? (
                        <div className="client-concept-feedback-box">
                          <textarea
                            value={feedbackText}
                            onChange={(event) => setFeedbackText(event.target.value)}
                            placeholder="Tell your consultant what should change."
                          />
                          <div>
                            <button
                              type="button"
                              disabled={working === item.id}
                              onClick={() => submitConceptChanges(item.id)}
                              className="client-panel-action"
                            >
                              {working === item.id ? "Sending..." : "Submit feedback"}
                            </button>
                            <button
                              type="button"
                              disabled={working === item.id}
                              onClick={() => setFeedbackConceptId(null)}
                              className="client-panel-action secondary"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}

              {panel === "delivery" ? (
                <div className="client-panel-stack">
                  {deliverablesLoading ? (
                    <article>
                      <h3>Loading deliverables...</h3>
                      <p>Your consultant&apos;s shared files are being fetched.</p>
                    </article>
                  ) : null}

                  {/* Showcase Selected Moodboards */}
                  {moodboards.filter((m) => m.clientSelected || m.is_selected).length > 0 ? (
                    <article>
                      <h3>Selected Moodboard Direction</h3>
                      <div className="client-panel-grid" style={{ marginTop: "1rem" }}>
                        {moodboards.filter((m) => m.clientSelected || m.is_selected).map((item) => (
                          <div key={item.id} style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
                            {item.image_url ? (
                              <ProtectedAssetImage
                                src={item.image_url}
                                asBackground
                                className="client-panel-image"
                                fallbackText="No image"
                              />
                            ) : null}
                            <strong style={{ display: "block", marginTop: "8px", color: "#f8fafc" }}>{item.title}</strong>
                            <small style={{ color: "#94a3b8" }}>{item.description || "Client-selected visual direction."}</small>
                          </div>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  {/* Showcase Approved Concepts */}
                  {concepts.filter((c) => c.status === "approved").length > 0 ? (
                    <article>
                      <h3>Approved Brand Concepts</h3>
                      <div className="client-panel-grid" style={{ marginTop: "1rem" }}>
                        {concepts.filter((c) => c.status === "approved").map((item) => (
                          <div key={item.id} style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
                            {item.image_url ? (
                              <ProtectedAssetImage
                                src={item.image_url}
                                asBackground
                                className="client-panel-image"
                                fallbackText="No image"
                              />
                            ) : null}
                            <strong style={{ display: "block", marginTop: "8px", color: "#f8fafc" }}>{item.title} (v{item.version || 1})</strong>
                            <small style={{ color: "#38bdf8" }}>Approved Identity</small>
                          </div>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  {/* Payment Settlement Status */}
                  {payments.length > 0 ? (
                    <article>
                      <h3>Payment Settlement Status</h3>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "10px" }}>
                        {payments.map((p) => (
                          <div key={p.id} style={{ background: "rgba(255,255,255,0.03)", padding: "8px 14px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", fontSize: "0.9rem" }}>
                            <span style={{ color: "#94a3b8", textTransform: "capitalize" }}>{p.type || "Milestone"}: </span>
                            <strong style={{ color: "#f8fafc" }}>Rs {Number(p.amount || 0).toLocaleString()} </strong>
                            <span style={{ color: p.status === "paid" ? "#4ade80" : "#fbbf24", marginLeft: "4px" }}>
                              ({p.status === "paid" ? "Paid" : "Pending"})
                            </span>
                          </div>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  {!deliverablesLoading && deliverables.length === 0 ? (
                    <article>
                      <h3>Deliverables are being prepared.</h3>
                      <p>{deliverablesError || "Your consultant will share final deliverable files here."}</p>
                    </article>
                  ) : null}
                  {!deliverablesLoading && deliverablesError && deliverables.length > 0 ? (
                    <article>
                      <p>{deliverablesError}</p>
                    </article>
                  ) : null}
                  {!deliverablesLoading && deliverables.map((item) => (
                    <article key={item.id} className="client-delivery-row">
                      <div className="client-delivery-info">
                        <h3>{item.title || item.label}</h3>
                        {item.description ? <p>{item.description}</p> : null}
                        <p>
                          {item.file_name || item.fileFormat || item.category || "File"}
                          {item.created_at ? ` - ${new Date(item.created_at).toLocaleDateString()}` : ""}
                        </p>
                        {item.can_download === false || (!item.file_url && item.can_download !== true) ? (
                          <p>{item.download_locked_reason || FINAL_PAYMENT_REQUIRED_MESSAGE}</p>
                        ) : null}
                      </div>
                      {item.can_download !== false && item.file_url ? (
                        <a
                          href={item.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="client-panel-action"
                        >
                          Download Final File
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="client-panel-action secondary"
                        >
                          Locked (Final Payment Required)
                        </button>
                      )}
                    </article>
                  ))}
                  {!deliverablesLoading ? (
                    <article className="client-agreement-card client-final-signoff-row">
                      <div className="client-agreement-summary">
                        <h3>{project.clientSignedOff ? "Project completed" : "Final sign-off"}</h3>
                        <p>
                          {project.clientSignedOff
                            ? "Project completed"
                            : signOffDisabledReason || "Accept the final delivery and complete this project."}
                        </p>
                        {signOffError ? <p>{signOffError}</p> : null}
                      </div>
                      <button
                        type="button"
                        disabled={project.clientSignedOff || Boolean(signOffDisabledReason) || working === "sign-off"}
                        onClick={handleSignOff}
                        className="client-panel-action"
                      >
                        {project.clientSignedOff
                          ? "Completed"
                          : working === "sign-off"
                            ? "Completing..."
                            : "Accept & Complete Project"}
                      </button>
                    </article>
                  ) : null}
                </div>
              ) : null}

              {panel === "agreement" ? (
                <div className="client-panel-stack">
                  {agreementLoading ? (
                    <article>
                      <h3>Loading agreement...</h3>
                      <p>Your consultant&apos;s agreement file is being fetched.</p>
                    </article>
                  ) : null}
                  {!agreementLoading && !agreement ? (
                    <article>
                      <h3>Agreement is being prepared.</h3>
                      <p>{agreementError || "Your consultant will share the agreement here."}</p>
                    </article>
                  ) : null}
                  {!agreementLoading && agreementError && agreement ? (
                    <article>
                      <p>{agreementError}</p>
                    </article>
                  ) : null}
                  {!agreementLoading && agreement && agreement.status === "signed" ? (
                    <div className="client-agreement-verified-card">
                      <div className="client-verified-card-header">
                        <div className="client-verified-badge">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Executed & Legally Binding</span>
                        </div>
                        <span className="client-verified-version">Version v{agreement.current_version || 1}.0</span>
                      </div>

                      <div className="client-verified-body">
                        <div className="client-audit-info">
                          <h3 className="client-verified-title">{agreement.title || "Service Agreement"}</h3>
                          <p className="client-verified-subtitle">This contract has been digitally executed and recorded on Floxa eSign.</p>

                          <div className="client-audit-grid">
                            <div className="client-audit-item">
                              <span className="client-audit-label">Signed by</span>
                              <strong className="client-audit-value">{agreement.signer_name || "Authorized Client"}</strong>
                            </div>
                            <div className="client-audit-item">
                              <span className="client-audit-label">Signed Timestamp</span>
                              <strong className="client-audit-value">
                                {agreement.signed_at ? new Date(agreement.signed_at).toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }) : "Completed"}
                              </strong>
                            </div>
                            <div className="client-audit-item">
                              <span className="client-audit-label">Signing Method</span>
                              <strong className="client-audit-value">
                                {agreement.signature_method === "drawn" ? "Drawn Signature" : agreement.signature_method === "uploaded" ? "Uploaded Image" : "Digitally Typed"}
                              </strong>
                            </div>
                            <div className="client-audit-item">
                              <span className="client-audit-label">Digital Audit</span>
                              <strong className="client-audit-value audit-hash" title={agreement.signature_metadata?.hash || "SHA-256 Verified"}>
                                {agreement.signature_metadata?.hash ? `${agreement.signature_metadata.hash.slice(0, 14)}...` : "SHA-256 Verified"}
                              </strong>
                            </div>
                          </div>
                        </div>

                        <div className="client-signature-stamp-box">
                          <span className="client-stamp-label">Digital Signature</span>
                          <div className="client-stamp-display">
                            {agreement.signature_image ? (
                              <img src={agreement.signature_image} alt="Signature Stamp" className="client-stamp-img" />
                            ) : (
                              <span className="client-stamp-typed">{agreement.signer_name || "Signed"}</span>
                            )}
                          </div>
                          <div className="client-stamp-footer">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                            </svg>
                            <span>Verified eSign Certificate</span>
                          </div>
                        </div>
                      </div>

                      <div className="client-verified-actions-bar">
                        <div className="client-verified-btn-group">
                          <button
                            type="button"
                            disabled={!agreement.file_url || working === "agreement"}
                            onClick={previewAgreement}
                            className="client-panel-action"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            Preview Agreement
                          </button>
                          <button
                            type="button"
                            disabled={!agreement.file_url || working === "agreement"}
                            onClick={downloadAgreement}
                            className="client-panel-action secondary"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {working === "agreement" ? "Downloading..." : "Download PDF"}
                          </button>
                        </div>

                        <button
                          type="button"
                          className="client-inline-toggle-btn"
                          onClick={() => setShowInlineAgreement((prev) => !prev)}
                        >
                          {showInlineAgreement ? "Hide Document" : "View on Page"}
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            style={{ transform: showInlineAgreement ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </div>

                      {showInlineAgreement && agreement.file_url ? (
                        <div className="client-inline-preview-container">
                          <iframe
                            className="client-agreement-preview-frame"
                            src={agreement.file_url}
                            title="Signed Agreement Document"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!agreementLoading && agreement && agreement.status !== "signed" ? (
                    <article className="client-agreement-card">
                      <div className="client-agreement-summary">
                        {agreement.isProjectAgreement && agreement.status === "signature_requested" ? (
                          <p className="client-agreement-badge">New Agreement Available</p>
                        ) : null}
                        {agreement.isProjectAgreement && agreement.status !== "shared" && Number(agreement.current_version || 1) > 1 ? (
                          <p className="client-agreement-badge">Agreement Updated</p>
                        ) : null}
                        <h3>{agreement.title || "Service Agreement"}</h3>
                        <p>
                          Basic Agreement
                          {agreement.generated_at ? ` - ${new Date(agreement.generated_at).toLocaleString()}` : ""}
                        </p>
                        {agreement.isProjectAgreement ? (
                          <p>Current Version - v{agreement.current_version || 1}</p>
                        ) : null}
                        {agreement.isProjectAgreement && agreement.last_updated_at ? (
                          <p>Last Updated - {new Date(agreement.last_updated_at).toLocaleString()}</p>
                        ) : null}
                        <p>Status - {getAgreementStatusLabel(agreement)}</p>
                      </div>
                      <div className="client-agreement-workspace">
                        <div className="client-agreement-actions">
                          <button
                            type="button"
                            disabled={!agreement.file_url || working === "agreement"}
                            onClick={previewAgreement}
                            className="client-panel-action"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            disabled={!agreement.file_url || working === "agreement"}
                            onClick={downloadAgreement}
                            className="client-panel-action secondary"
                          >
                            {working === "agreement" ? "Downloading..." : "Download"}
                          </button>
                        </div>
                        {agreement.isProjectAgreement && agreement.status === "signature_requested" ? (
                          <div className="client-signature-box">
                            {agreement.file_url ? (
                              <iframe
                                className="client-agreement-preview-frame"
                                src={agreement.file_url}
                                title="Agreement preview"
                              />
                            ) : null}
                            <div className="client-signature-heading">
                              <strong>eSignature</strong>
                            </div>
                            <label className="client-panel-check client-signature-name-field">
                              <span>Full legal name</span>
                              <input
                                value={signerName}
                                onChange={(event) => setSignerName(event.target.value)}
                                type="text"
                                placeholder="Type your full legal name"
                              />
                            </label>
                            <div className="client-signature-methods">
                              <label className="client-panel-check">
                                <input
                                  checked={signatureMethod === "typed"}
                                  onChange={() => setSignatureMethod("typed")}
                                  type="radio"
                                  name="signature-method"
                                />
                                <span>Type Name</span>
                              </label>
                              <label className="client-panel-check">
                                <input
                                  checked={signatureMethod === "drawn"}
                                  onChange={() => setSignatureMethod("drawn")}
                                  type="radio"
                                  name="signature-method"
                                />
                                <span>Draw Signature</span>
                              </label>
                              <label className="client-panel-check">
                                <input
                                  checked={signatureMethod === "uploaded"}
                                  onChange={() => setSignatureMethod("uploaded")}
                                  type="radio"
                                  name="signature-method"
                                />
                                <span>Upload Signature Image</span>
                              </label>
                            </div>
                            {signatureMethod === "drawn" ? (
                              <div className="client-signature-draw-area">
                                <canvas
                                  ref={signatureCanvasRef}
                                  width="320"
                                  height="120"
                                  onMouseDown={startDrawingSignature}
                                  onMouseMove={drawSignature}
                                  onMouseUp={stopDrawingSignature}
                                  onMouseLeave={stopDrawingSignature}
                                  onTouchStart={startDrawingSignature}
                                  onTouchMove={drawSignature}
                                  onTouchEnd={stopDrawingSignature}
                                  style={{ border: "1px solid rgba(255,255,255,0.25)", width: "100%", maxWidth: 320 }}
                                />
                                <button type="button" className="client-panel-action secondary" onClick={clearDrawnSignature}>
                                  Clear
                                </button>
                              </div>
                            ) : null}
                            {signatureMethod === "uploaded" ? (
                              <label className="client-panel-check">
                                <input accept="image/png,image/jpeg,image/webp" onChange={readSignatureUpload} type="file" />
                                <span>{uploadedSignature ? "Signature image selected" : "Choose signature image"}</span>
                              </label>
                            ) : null}
                            <label className="client-panel-check client-signature-consent">
                              <input
                                checked={hasReadAgreement}
                                onChange={(event) => setHasReadAgreement(event.target.checked)}
                                type="checkbox"
                              />
                              <span>I have read and agree to the agreement</span>
                            </label>
                            <button
                              type="button"
                              disabled={working === "agreement-sign"}
                              onClick={signAgreement}
                              className="client-panel-action"
                            >
                              {working === "agreement-sign" ? "Signing..." : "Finish Signing"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ) : null}
                </div>
              ) : null}

              {panel === "payments" ? (
                <div className="client-panel-stack">
                  {paymentsLoading ? (
                    <article>
                      <h3>Loading payments...</h3>
                      <p>Your payment schedule is being fetched.</p>
                    </article>
                  ) : null}
                  {!paymentsLoading && payments.length === 0 ? (
                    <article>
                      <h3>Payments are being prepared.</h3>
                      <p>{paymentsError || "Your consultant will request payments here."}</p>
                    </article>
                  ) : null}
                  {!paymentsLoading && paymentsError && payments.length > 0 ? (
                    <article>
                      <p>{paymentsError}</p>
                    </article>
                  ) : null}
                  {!paymentsLoading && (paymentCheckoutMessage || paymentCallbackData) ? (
                    <article aria-live="polite">
                      <p>
                        {paymentCheckoutMessage ||
                          "Payment could not be confirmed yet. Please retry verification or refresh the page."}
                      </p>
                      {paymentCallbackData && !paymentCheckoutMessage ? (
                        <button
                          type="button"
                          className="client-panel-action"
                          disabled={Boolean(paymentCheckoutLoadingId)}
                          onClick={() => verifyPaymentCallback(paymentCallbackData)}
                        >
                          {paymentCheckoutLoadingId ? "Verifying..." : "Retry verification"}
                        </button>
                      ) : null}
                    </article>
                  ) : null}
                  {!paymentsLoading && payments.map((item) => {
                    const paymentBusy = paymentCheckoutLoadingId === item.id || activePaymentCheckoutId === item.id;
                    const canPayNow = isPayableMilestone(item);
                    const checkoutBlocked = Boolean(activePaymentCheckoutId) && activePaymentCheckoutId !== item.id;

                    return (
                      <article key={item.id || item.type} className="client-delivery-row client-payment-row">
                        <div className="client-payment-info">
                          <h3>{getPaymentTypeLabel(item.type)} payment</h3>
                          <p>
                            {item.percentage}% - {formatPaymentAmount(item.amount)}
                          </p>
                        </div>
                        <div className="client-payment-actions">
                          <span className="client-panel-action secondary">
                            {getPaymentStatusLabel(item.status)}
                          </span>
                          {item.status === "requested" ? (
                            <button
                              type="button"
                              disabled={!canPayNow || paymentBusy || checkoutBlocked}
                              onClick={() => startPaymentCheckout(item)}
                              className="client-panel-action"
                            >
                              {paymentBusy && paymentCheckoutMessage === "Verifying payment..."
                                ? "Verifying..."
                                : paymentBusy
                                  ? "Opening..."
                                  : "Pay Now"}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}

          {activePreview ? (
            <div
              className="client-preview-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="client-preview-title"
              onClick={closePreview}
            >
              <div
                className="client-preview-modal"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="client-preview-header">
                  <h3 id="client-preview-title">{activePreview.title}</h3>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    className="client-preview-close-btn"
                    onClick={closePreview}
                    aria-label="Close preview"
                  >
                    Close
                  </button>
                </div>
                <div className="client-preview-body">
                  <ProtectedAssetImage
                    src={activePreview.imageUrl}
                    alt={activePreview.title}
                    draggable={false}
                    onContextMenu={(event) => event.preventDefault()}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      );
}
