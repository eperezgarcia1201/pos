import { useState } from "react";
import { API_URL, apiFetch } from "../lib/api";
import { AppLanguage, SessionUser, setCurrentUser } from "../lib/session";
import { t } from "../lib/i18n";

type Props = {
  open: boolean;
  title?: string;
  language?: AppLanguage;
  onSuccess: (user: SessionUser) => void;
  onCancel?: () => void;
};

export default function PinGate({ open, title, language = "en", onSuccess, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const backOrCancel = () => {
    if (pin.length === 0) {
      setError("");
      onCancel?.();
      return;
    }
    setPin((prev) => prev.slice(0, -1));
  };

  const submit = async () => {
    if (pin.length < 1) {
      setError("");
      onCancel?.();
      return;
    }
    try {
      const result = await apiFetch("/auth/pin", {
        method: "POST",
        body: JSON.stringify({ pin })
      });
      const user = result.user as SessionUser;
      const token = typeof result.token === "string" ? result.token : undefined;
      const sessionUser: SessionUser = { ...user, token };
      setCurrentUser(sessionUser);
      setPin("");
      setError("");
      onSuccess(sessionUser);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("invalid_access_code", language);
      if (message.toLowerCase().includes("failed to fetch")) {
        setError(t("server_offline_start_backend", language, { url: API_URL }));
      } else {
        setError(message || t("invalid_access_code", language));
        setPin("");
      }
    }
  };

  return (
    <div className="pin-gate">
      <div className="pin-gate-card">
        <h3>{title || t("enter_access_code", language)}</h3>
        <div className="pin-display">
          <div className="pin-dots">
            {pin.length === 0 ? (
              <div className="pin-placeholder">{t("tap_digits_to_enter", language)}</div>
            ) : (
              Array.from({ length: pin.length }).map((_, idx) => <span key={idx} className="pin-dot on" />)
            )}
          </div>
          <button
            type="button"
            className="pin-back"
            onClick={backOrCancel}
            aria-label="Backspace"
          >
            ⟵
          </button>
        </div>
        {error && <div className="pin-error">{error}</div>}
        <div className="pin-keypad">
          {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => {
                if (pin.length >= 10) return;
                setPin((prev) => prev + String(num));
              }}
            >
              {num}
            </button>
          ))}
          <button type="button" className="back" onClick={backOrCancel}>←</button>
          <button type="button" onClick={() => setPin((prev) => (prev.length < 10 ? prev + "0" : prev))}>0</button>
          <button type="button" className="confirm" onClick={submit}>✓</button>
        </div>
      </div>
    </div>
  );
}
