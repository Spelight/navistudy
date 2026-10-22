import React from "react";
import "./analytics";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PassportCallback } from "./PassportCallback";
import "./styles.css";

const isPassportCallback = window.location.pathname.endsWith("/navistudy-callback.html");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isPassportCallback ? <PassportCallback /> : <App />}
  </React.StrictMode>
);
