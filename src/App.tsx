import { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import EmployePage from "./components/EmployePage";
import ProductionPage from "./components/ProductionPage";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(localStorage.getItem('token')));

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login onLogin={() => setIsLoggedIn(true)} />} />
        <Route path="/dashboard" element={isLoggedIn ? <Dashboard /> : <Navigate to="/" />} />
        <Route path="/employe" element={isLoggedIn ? <EmployePage /> : <Navigate to="/" />} />
        <Route path="/production" element={isLoggedIn ? <ProductionPage /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
