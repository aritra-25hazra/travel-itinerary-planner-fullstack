import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { AuthProvider } from "./lib/auth";
import Itinerary from "./pages/Itinerary";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Plan from "./pages/Plan";
import SharedTrip from "./pages/SharedTrip";
import Trips from "./pages/Trips";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/plan" element={<Plan />} />
            <Route path="/itinerary" element={<Itinerary />} />
            <Route path="/trips" element={<Trips />} />
            <Route path="/login" element={<Login />} />
            <Route path="/share/:token" element={<SharedTrip />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
