import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Upload from "./pages/Upload";
import './App.css';


function App() {
    //const baseName = window.location.pathname.replace("/index.html", "");
  return (
      
      <BrowserRouter basename="/InnovatorServer35/Client/scripts/importer">

          <Routes>
              <Route path="/" element={<Upload />} />
              <Route path="/index.html" element={<Upload />} />

          </Routes>

      </BrowserRouter>
  );
}

export default App;
