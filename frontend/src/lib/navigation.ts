import type { NavigateFunction } from "react-router-dom";

export function goBackOrHome(navigate: NavigateFunction) {
  const historyIndex = window.history.state?.idx;
  if (typeof historyIndex === "number" && historyIndex > 0) {
    navigate(-1);
    return;
  }
  navigate("/");
}

