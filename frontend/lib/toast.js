import { toast } from "react-toastify";

const toastOptions = {
  className: "floxa-toast",
  progressClassName: "floxa-toast-progress",
};

export function showSuccess(message) {
  toast.success(message, toastOptions);
}

export function showError(message) {
  toast.error(message, toastOptions);
}

export function showInfo(message) {
  toast.info(message, toastOptions);
}

export function showWarning(message) {
  toast.warning(message, toastOptions);
}
