import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import NewSegmentation from "./pages/NewSegmentation.jsx";
import Results from "./pages/Results.jsx";
import ResultDetail from "./pages/ResultDetail.jsx";
import AboutModel from "./pages/AboutModel.jsx";
import AboutProject from "./pages/AboutProject.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="segment" element={<NewSegmentation />} />
        <Route path="results" element={<Results />} />
        <Route path="results/:id" element={<ResultDetail />} />
        <Route path="model" element={<AboutModel />} />
        <Route path="project" element={<AboutProject />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
