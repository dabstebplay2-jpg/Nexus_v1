import React from "react";
import { createRoot } from "react-dom/client";
import "./global.css";

function App() {
  return (
    <main className="app">
      <p className="eyebrow">Nexus Website Next</p>
      <h1>React migration scaffold</h1>
      <p>Текущий production-сайт пока находится в папке website. Этот scaffold нужен для будущего переноса на React/Vite.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
