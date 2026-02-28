import { useCallback, useEffect, useMemo, useState } from "react";

import { BottomNav, type AppTab } from "./components/BottomNav";
import { Alerts } from "./pages/Alerts";
import { Home } from "./pages/Home";
import { PropertyDetail } from "./pages/PropertyDetail";
import { Settings } from "./pages/Settings";
import "./App.css";

function getCurrentPath(): string {
  if (!window.location.pathname || window.location.pathname === "") {
    return "/";
  }

  return window.location.pathname;
}

function getDealIdFromPath(path: string): string | null {
  if (!path.startsWith("/property/")) {
    return null;
  }

  const segment = path.replace("/property/", "").trim();
  if (!segment) {
    return null;
  }

  return decodeURIComponent(segment);
}

function getTabFromPath(path: string): AppTab {
  if (path.startsWith("/alerts")) {
    return "alerts";
  }

  if (path.startsWith("/settings")) {
    return "settings";
  }

  return "home";
}

function App() {
  const [path, setPath] = useState<string>(() => getCurrentPath());

  useEffect(() => {
    const handlePopState = () => setPath(getCurrentPath());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback(
    (nextPath: string) => {
      if (nextPath === path) {
        return;
      }

      window.history.pushState({}, "", nextPath);
      setPath(nextPath);
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [path],
  );

  const activeTab = useMemo(() => getTabFromPath(path), [path]);
  const activeDealId = useMemo(() => getDealIdFromPath(path), [path]);

  const handleTabChange = (tab: AppTab) => {
    if (tab === "home") {
      navigate("/");
      return;
    }

    if (tab === "alerts") {
      navigate("/alerts");
      return;
    }

    navigate("/settings");
  };

  const renderActivePage = () => {
    if (activeDealId) {
      return <PropertyDetail dealId={activeDealId} onBack={() => navigate("/")} />;
    }

    if (activeTab === "alerts") {
      return <Alerts />;
    }

    if (activeTab === "settings") {
      return <Settings />;
    }

    return <Home onOpenDeal={(dealId) => navigate(`/property/${encodeURIComponent(dealId)}`)} />;
  };

  return (
    <div className="app-shell">
      <main className="app-main">{renderActivePage()}</main>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

export default App;
