import { useCallback, useEffect, useMemo, useState } from "react";

import { BottomNav, type AppTab } from "./components/BottomNav";
import { PropertyNav, type PropertyTab } from "./components/PropertyNav";
import { Alerts } from "./pages/Alerts";
import { Home } from "./pages/Home";
import { PropertyDocuments } from "./pages/PropertyDocuments";
import { PropertyEmailDetail } from "./pages/PropertyEmailDetail";
import { PropertyInbox } from "./pages/PropertyInbox";
import { PropertyPipeline } from "./pages/PropertyPipeline";
import { Settings } from "./pages/Settings";
import "./App.css";

function getCurrentPath(): string {
  if (!window.location.pathname || window.location.pathname === "") {
    return "/";
  }

  return window.location.pathname;
}

type Route =
  | { kind: "home" }
  | { kind: "alerts" }
  | { kind: "settings" }
  | {
      kind: "property";
      propertyId: string;
      tab: PropertyTab;
      threadId: string | null;
      needsRedirect: boolean;
    };

function parseRoute(path: string): Route {
  const segments = path.split("/").filter(Boolean);

  if (segments[0] === "property" && segments[1]) {
    const propertyId = decodeURIComponent(segments[1]);
    const tab = segments[2];

    if (!tab) {
      return {
        kind: "property",
        propertyId,
        tab: "pipeline",
        threadId: null,
        needsRedirect: true,
      };
    }

    if (tab === "messages") {
      return {
        kind: "property",
        propertyId,
        tab: "inbox",
        threadId: segments[3] ? decodeURIComponent(segments[3]) : null,
        needsRedirect: true,
      };
    }

    if (tab === "inbox") {
      return {
        kind: "property",
        propertyId,
        tab: "inbox",
        threadId: segments[3] ? decodeURIComponent(segments[3]) : null,
        needsRedirect: false,
      };
    }

    if (tab === "pipeline" || tab === "documents") {
      return {
        kind: "property",
        propertyId,
        tab,
        threadId: null,
        needsRedirect: false,
      };
    }

    return {
      kind: "property",
      propertyId,
      tab: "pipeline",
      threadId: null,
      needsRedirect: true,
    };
  }

  if (segments[0] === "alerts") {
    return { kind: "alerts" };
  }

  if (segments[0] === "settings") {
    return { kind: "settings" };
  }

  return { kind: "home" };
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

  const route = useMemo(() => parseRoute(path), [path]);

  useEffect(() => {
    if (route.kind !== "property" || !route.needsRedirect) {
      return;
    }

    const base = `/property/${encodeURIComponent(route.propertyId)}/${route.tab}`;
    const normalizedPath =
      route.tab === "inbox" && route.threadId
        ? `${base}/${encodeURIComponent(route.threadId)}`
        : base;

    if (normalizedPath === path) {
      return;
    }

    window.history.replaceState({}, "", normalizedPath);
    setPath(normalizedPath);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [path, route]);

  const activeTab: AppTab = useMemo(() => {
    if (route.kind === "alerts") {
      return "alerts";
    }

    if (route.kind === "settings") {
      return "settings";
    }

    return "home";
  }, [route]);

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
    if (route.kind === "property") {
      if (route.tab === "pipeline") {
        return (
          <PropertyPipeline
            propertyId={route.propertyId}
            onBackToHome={() => navigate("/")}
          />
        );
      }

      if (route.tab === "documents") {
        return (
          <PropertyDocuments
            propertyId={route.propertyId}
            onBackToHome={() => navigate("/")}
          />
        );
      }

      if (route.threadId) {
        return (
          <PropertyEmailDetail
            propertyId={route.propertyId}
            threadId={route.threadId}
            onBackToHome={() => navigate("/")}
            onBackToInbox={() =>
              navigate(`/property/${encodeURIComponent(route.propertyId)}/inbox`)
            }
          />
        );
      }

      return (
        <PropertyInbox
          propertyId={route.propertyId}
          onBackToHome={() => navigate("/")}
          onOpenThread={(threadId) =>
            navigate(
              `/property/${encodeURIComponent(route.propertyId)}/inbox/${encodeURIComponent(threadId)}`,
            )
          }
        />
      );
    }

    if (route.kind === "alerts") {
      return <Alerts />;
    }

    if (route.kind === "settings") {
      return <Settings />;
    }

    return (
      <Home
        onOpenDeal={(dealId) =>
          navigate(`/property/${encodeURIComponent(dealId)}`)
        }
      />
    );
  };

  return (
    <div className="app-shell">
      <main className="app-main">{renderActivePage()}</main>
      {route.kind === "property" ? (
        <PropertyNav
          activeTab={route.tab}
          onTabChange={(tab) =>
            navigate(`/property/${encodeURIComponent(route.propertyId)}/${tab}`)
          }
        />
      ) : (
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      )}
    </div>
  );
}

export default App;
