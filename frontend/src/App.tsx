import { useState } from "react";
import "./App.css";

interface HealthResponse {
  status: string;
  timestamp: number;
  message: string;
}

function App() {
  const [healthStatus, setHealthStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const checkHealth = async () => {
    setLoading(true);
    setError("");
    setHealthStatus("");

    try {
      const response = await fetch("http://localhost:3001/health");

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: HealthResponse = await response.json();
      setHealthStatus(
        `✅ Backend is healthy! Status: ${data.status} - ${data.message}`,
      );
    } catch (err) {
      setError(
        `❌ Failed to connect to backend: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <h1>🏠 Birdhouse</h1>
      <p>Contract-to-close transaction manager</p>

      <div className="card">
        <button
          onClick={checkHealth}
          disabled={loading}
          style={{
            padding: "12px 24px",
            fontSize: "16px",
            cursor: loading ? "not-allowed" : "pointer",
            backgroundColor: loading ? "#ccc" : "#646cff",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontWeight: "500",
          }}
        >
          {loading ? "Checking..." : "Check Backend Health"}
        </button>

        {healthStatus && (
          <p style={{ color: "#4ade80", marginTop: "16px", fontSize: "14px" }}>
            {healthStatus}
          </p>
        )}

        {error && (
          <p style={{ color: "#ef4444", marginTop: "16px", fontSize: "14px" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
