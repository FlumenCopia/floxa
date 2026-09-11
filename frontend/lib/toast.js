import { toast } from "react-toastify";

const toastOptions = {
  className: "floxa-toast",
  progressClassName: "floxa-toast-progress",
};

export function showSuccess(message, options = {}) {
  const toastId = options.toastId || (typeof message === "string" ? `msg-${message}` : undefined);
  toast.success(message, { ...toastOptions, toastId, ...options });
}

export function showError(message, options = {}) {
  const toastId = options.toastId || (typeof message === "string" ? `msg-${message}` : undefined);
  toast.error(message, { ...toastOptions, toastId, ...options });
}

export function showInfo(message, options = {}) {
  const toastId = options.toastId || (typeof message === "string" ? `msg-${message}` : undefined);
  toast.info(message, { ...toastOptions, toastId, ...options });
}

export function showWarning(message, options = {}) {
  const toastId = options.toastId || (typeof message === "string" ? `msg-${message}` : undefined);
  toast.warning(message, { ...toastOptions, toastId, ...options });
}
