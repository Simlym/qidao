import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App.jsx";
import "./styles/index.css";

class StartupBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) { window.qidaoStartup?.fail(error); }

  render() { return this.state.failed ? null : this.props.children; }
}

function Startup() {
  React.useEffect(() => { window.qidaoStartup?.ready(); }, []);
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StartupBoundary><Startup /></StartupBoundary>
  </React.StrictMode>
);
