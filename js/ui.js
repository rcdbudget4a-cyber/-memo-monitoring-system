/**
 * Reusable UI Helpers Module
 * RCD Memorandum Monitoring System (PRO 4A)
 */

class UIManager {
  showToast(message, type = "info") {
    let toast = document.getElementById("app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast";
      toast.style.cssText = "position:fixed; bottom:24px; right:24px; z-index:10000; padding:12px 20px; border-radius:8px; font-weight:700; font-size:0.9rem; box-shadow:0 10px 25px rgba(0,0,0,0.3); transition:all 0.3s ease; display:none;";
      document.body.appendChild(toast);
    }

    if (type === "error") {
      toast.style.background = "#fee2e2";
      toast.style.color = "#991b1b";
      toast.style.border = "1px solid #fca5a5";
    } else if (type === "success") {
      toast.style.background = "#dcfce7";
      toast.style.color = "#166534";
      toast.style.border = "1px solid #86efac";
    } else {
      toast.style.background = "#eff6ff";
      toast.style.color = "#1e40af";
      toast.style.border = "1px solid #93c5fd";
    }

    toast.textContent = message;
    toast.style.display = "block";

    setTimeout(() => {
      toast.style.display = "none";
    }, 4000);
  }

  confirm(message) {
    return window.confirm(message);
  }
}

window.uiManager = new UIManager();
