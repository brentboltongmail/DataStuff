import { createRoot } from "react-dom/client";
import App from "./App";
import "./themes.css";
import "./styles.css";
import { applyThemeToDocument, loadTheme } from "./themes";

applyThemeToDocument(loadTheme());

createRoot(document.getElementById("root")!).render(<App />);
