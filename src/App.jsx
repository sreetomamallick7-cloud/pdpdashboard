import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DashboardLayout } from './components/DashboardLayout';
import { Navigation } from './components/Navigation';
import { AdminUpload } from './components/AdminUpload';
import { TrendsDashboard } from './components/TrendsDashboard';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <div className="App-container">
        <Navigation />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<DashboardLayout />} />
            <Route path="/admin" element={<AdminUpload />} />
            <Route path="/trends" element={<TrendsDashboard />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
