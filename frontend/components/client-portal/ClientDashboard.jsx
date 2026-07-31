"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clientPortalService } from "../../services/clientPortalService";

const phaseLabels = [
  "Profile",
  "Discovery",
  "Brand DNA",
  "Moodboards",
  "Concepts",
  "Agreement",
  "Delivery",
  "Sign Off",
];
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
      discovery: 1,
      advance_payment: 1,
      advance_paid: 1,
      brand_dna: 2,
      moodboards: 3,
      concepts: 4,
      agreement: 5,
      deliverables: 6,
      final_paid: 7,
      delivered: 7,
    };

    if (workflowStatus in statusMap) {
      return statusMap[workflowStatus];
    }
  }

  const pct = Number(progress || 0);

  if (pct >= 100) {
    return 7;
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

  if (pct >= 45) {
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
  const [panel, setPanel] = useState(null);
  const [working, setWorking] = useState("");
  const [brandDNAReport, setBrandDNAReport] = useState(null);
  const [brandDNAReportLoading, setBrandDNAReportLoading] = useState(false);
  const [moodboards, setMoodboards] = useState(project.moodboards || []);
  const [moodboardsLoading, setMoodboardsLoading] = useState(false);
  const [moodboardsError, setMoodboardsError] = useState("");
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
  const [notificationsError, setNotificationsError] = useState("");
  const notificationsRef = useRef(null);
  const [activePreview, setActivePreview] = useState(null);
  const lastFocusedElementRef = useRef(null);
  const closeButtonRef = useRef(null);

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

    return () => {
      isActive = false;
    };
  }, []);

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

  async function selectMoodboard(id) {
    setWorking(id);
    setMoodboardsError("");

    try {
      const response = await clientPortalService.selectMoodboard(id);
      const selectedId = response.data?.id ?? id;

      setMoodboards((currentMoodboards) =>
        currentMoodboards.map((item) => ({
          ...item,
          clientSelected: item.id === selectedId,
          is_selected: item.id === selectedId,
        }))
      );
      await onProjectRefresh?.();
    } catch (error) {
      setMoodboardsError(error?.detail || "Unable to select moodboard. Please try again.");
    } finally {
      setWorking("");
    }
  }

  async function downloadAgreement() {
    if (!agreement) {
      return;
    }

    setWorking("agreement");

    try {
      const response = await clientPortalService.downloadAgreement(agreement);

      if (response.success && response.data?.fileUrl) {
        window.open(response.data.fileUrl, "_blank", "noopener,noreferrer");
      } else {
        window.alert(response.error || "Agreement file is not available.");
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to open this agreement.");
    } finally {
      setWorking("");
    }
  }

  function previewAgreement() {
    if (!agreement?.file_url) {
      window.alert("Agreement file is not available.");
      return;
    }

    window.open(agreement.file_url, "_blank", "noopener,noreferrer");
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

  async function approveConcept(id) {
    const confirmed = window.confirm("Approve this concept?");

    if (!confirmed) {
      return;
    }

    setWorking(id);
    setConceptsError("");
    setConceptsMessage("");

    try {
      await clientPortalService.submitConceptFeedback(id, { action: "approved" });
      await refreshConcepts();
      await onProjectRefresh?.();
      setConceptsMessage("Concept approved.");
    } catch (error) {
      setConceptsError(error?.detail || "Unable to approve concept. Please try again.");
    } finally {
      setWorking("");
    }
  }

  function openConceptFeedback(id) {
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

  async function openPanel(nextPanel) {
    setPanel(nextPanel);
    setSignOffError("");

    if (nextPanel === "moodboards") {
      setMoodboardsLoading(true);
      setMoodboardsError("");

      try {
        const response = await clientPortalService.getMoodboards();
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
        const response = await clientPortalService.getClientDeliverables();
        setDeliverables(response.success ? response.data : []);
        setDeliverablesError(response.success ? "" : response.error || "Deliverables are not ready yet.");
      } finally {
        setDeliverablesLoading(false);
      }

      try {
        const response = await clientPortalService.getClientPayments();
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
        const response = await clientPortalService.getClientAgreement();
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
        const response = await clientPortalService.getClientPayments();
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

    setBrandDNAReportLoading(true);

    try {
      const response = await clientPortalService.getBrandDNAReport();
      setBrandDNAReport(response.success ? response.data : null);
    } finally {
      setBrandDNAReportLoading(false);
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

  const cards = [
    {
      symbol: "01",
      title: "Discovery Report",
      sub: "View your Brand DNA",
      active: pct >= 30,
      panel: "discovery",
    },
    {
      symbol: "02",
      title: "Moodboards",
      sub: `${moodboards.length} directions ready`,
      active: true,
      panel: "moodboards",
    },
    {
      symbol: "03",
      title: "Concepts",
      sub: `${concepts.length} concepts ready`,
      active: true,
      panel: "concepts",
    },
    {
      symbol: "04",
      title: "Agreement",
      sub: agreement ? "Ready to view" : "Pending",
      active: true,
      panel: "agreement",
    },
    {
      symbol: "05",
      title: "Delivery",
      sub: `${deliverables.length} files ready`,
      active: true,
      panel: "delivery",
    },
    {
      symbol: "06",
      title: "Payments",
      sub: `${payments.filter((item) => item.status === "requested").length} requested`,
      active: true,
      panel: "payments",
    },
  ];
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

  return (
    <div className="client-dashboard-screen">
      <header className="client-dashboard-header">
        <div>
          <div className="client-dashboard-wordmark">FLOXA</div>
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
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
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
                      className={`client-notification-item ${
                        notification.client_is_read === false ? "unread" : ""
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

        <div className="client-dashboard-stage-list">
          {phaseLabels.map((label, index) => (
            <div
              key={label}
              className={
                index < activePhaseIndex ? "complete" : index === activePhaseIndex ? "active" : ""
              }
            >
              <span />
              {pct >= 100 && index === phaseLabels.length - 1 ? "Complete" : label}
            </div>
          ))}
        </div>
      </section>

      <section className="client-dashboard-grid">
        {cards.map((card) => (
          <button
            key={card.panel}
            type="button"
            disabled={!card.active}
            className={`client-journey-card ${card.active ? "available" : ""}`}
            onClick={() => card.active && openPanel(card.panel)}
          >
            <span className="client-card-number">{card.symbol}</span>
            <span className="client-card-arrow">^</span>
            <strong>{card.title}</strong>
            <small>{card.sub}</small>
          </button>
        ))}
      </section>

      {panel ? (
        <section className="client-dashboard-panel client-design-enter">
          <div className="client-panel-heading">
            <div>
              <span>Project workspace</span>
              <h2>{panel}</h2>
            </div>
            <button type="button" onClick={() => setPanel(null)}>
              Close
            </button>
          </div>

          {panel === "discovery" ? (
            <div className="client-brand-summary">
              <span>Personality cluster</span>
              {brandDNAReportLoading ? (
                <>
                  <h3>Loading discovery report...</h3>
                  <p>Your consultant&apos;s Brand DNA report is being fetched.</p>
                </>
              ) : brandDNAReport ? (
                <>
                  <h3>{brandDNAReport.brand_personality_cluster || "Brand discovery complete"}</h3>
                  <p>{brandDNAReport.positioning_summary}</p>
                  <p>{brandDNAReport.business_summary}</p>
                  <p>{brandDNAReport.target_audience_summary}</p>
                  <p>{brandDNAReport.brand_feeling_summary}</p>
                  <p>{brandDNAReport.visual_direction_summary}</p>
                  <p>{brandDNAReport.competitor_summary}</p>
                  {brandDNAReport.updated_at ? (
                    <small>Updated {new Date(brandDNAReport.updated_at).toLocaleDateString()}</small>
                  ) : null}
                </>
              ) : (
                <>
                  <h3>{project.brandDNA?.personalityCluster || "Brand discovery complete"}</h3>
                  <p>
                    {project.brandDNA?.positioningStatement ||
                      "Your consultant is preparing the next stage."}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {panel === "moodboards" ? (
            <div className="client-panel-grid">
              {moodboardsLoading ? (
                <article>
                  <h3>Loading moodboards...</h3>
                  <p>Your consultant&apos;s visual directions are being fetched.</p>
                </article>
              ) : null}
              {!moodboardsLoading && moodboards.length === 0 ? (
                <article>
                  <h3>No moodboards yet</h3>
                  <p>{moodboardsError || "Your consultant is preparing visual directions."}</p>
                </article>
              ) : null}
              {!moodboardsLoading && moodboards.map((item) => (
                <article key={item.id} className={item.clientSelected || item.is_selected ? "selected" : ""}>
                  <div
                    className={`client-panel-image ${item.image_url ? "clickable" : ""}`.trim()}
                    role={item.image_url ? "button" : undefined}
                    tabIndex={item.image_url ? 0 : undefined}
                    aria-label={item.image_url ? `Enlarge preview for ${item.name || item.title || "moodboard"}` : undefined}
                    onClick={item.image_url ? (event) => openPreview(item, "moodboard", event) : undefined}
                    onKeyDown={
                      item.image_url
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openPreview(item, "moodboard", event);
                            }
                          }
                        : undefined
                    }
                    onContextMenu={(event) => event.preventDefault()}
                    style={
                      item.image_url
                        ? {
                            backgroundImage: `url(${item.image_url})`,
                            userSelect: "none",
                            WebkitUserDrag: "none",
                          }
                        : { userSelect: "none", WebkitUserDrag: "none" }
                    }
                  />
                  <h3>{item.name || item.title}</h3>
                  {item.description ? <p>{item.description}</p> : null}
                  <button
                    type="button"
                    disabled={item.clientSelected || item.is_selected || working === item.id}
                    onClick={() => selectMoodboard(item.id)}
                    className="client-panel-action"
                  >
                    {item.clientSelected || item.is_selected
                      ? "Selected"
                      : working === item.id
                        ? "Saving..."
                        : "Select direction"}
                  </button>
                </article>
              ))}
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
                    <section
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
                      style={{
                        backgroundImage: `url(${item.image_url})`,
                        userSelect: "none",
                        WebkitUserDrag: "none",
                      }}
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
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="client-panel-action"
                      >
                        View file
                      </a>
                    </div>
                  ) : null}
                  {item.status === "approved" ? (
                    <div>
                      <button type="button" className="client-panel-action" disabled>
                        Approved
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <button
                          type="button"
                          disabled={working === item.id}
                          onClick={() => approveConcept(item.id)}
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
                    </>
                  )}
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
              {!deliverablesLoading && deliverables.length === 0 ? (
                <article>
                  <h3>Deliverables are being prepared.</h3>
                  <p>{deliverablesError || "Your consultant will share final files here."}</p>
                </article>
              ) : null}
              {!deliverablesLoading && deliverablesError && deliverables.length > 0 ? (
                <article>
                  <p>{deliverablesError}</p>
                </article>
              ) : null}
              {!deliverablesLoading && deliverables.map((item) => (
                <article key={item.id} className="client-delivery-row">
                  <div>
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
                      Locked
                    </button>
                  )}
                </article>
              ))}
              {!deliverablesLoading ? (
                <article className="client-agreement-card">
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
              {!agreementLoading && agreement ? (
                <article className="client-delivery-row">
                  <div>
                    {agreement.isProjectAgreement && agreement.status === "signature_requested" ? (
                      <p>New Agreement Available</p>
                    ) : null}
                    {agreement.isProjectAgreement && agreement.status !== "shared" && Number(agreement.current_version || 1) > 1 ? (
                      <p>Agreement Updated</p>
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
                    {agreement.signed_at ? (
                      <p>Signed - {new Date(agreement.signed_at).toLocaleString()}</p>
                    ) : null}
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
                        <label className="client-panel-check">
                          <span>Full legal name</span>
                          <input
                            value={signerName}
                            onChange={(event) => setSignerName(event.target.value)}
                            type="text"
                            placeholder="Type your full legal name"
                          />
                        </label>
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
                        {signatureMethod === "drawn" ? (
                          <div>
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
                        <label className="client-panel-check">
                          <input
                            checked={signatureMethod === "uploaded"}
                            onChange={() => setSignatureMethod("uploaded")}
                            type="radio"
                            name="signature-method"
                          />
                          <span>Upload Signature Image</span>
                        </label>
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
                  <article key={item.id || item.type} className="client-delivery-row">
                    <div>
                      <h3>{getPaymentTypeLabel(item.type)} payment</h3>
                      <p>
                        {item.percentage}% - {formatPaymentAmount(item.amount)}
                      </p>
                    </div>
                    <div>
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
              <img
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
