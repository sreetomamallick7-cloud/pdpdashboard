import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DashboardLayout } from './components/DashboardLayout';
import { Navigation } from './components/Navigation';
import { AdminUpload } from './components/AdminUpload';
import { TrendsDashboard } from './components/TrendsDashboard';
import { WeeklyTrendsDashboard } from './components/WeeklyTrendsDashboard';
import { CategoryDrillDownPage } from './components/CategoryDrillDownPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/category/:categoryName" element={<CategoryDrillDownPage />} />
        
        <Route path="*" element={
          <div className="App-container">
            <Navigation />
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Routes>
                <Route path="/" element={<DashboardLayout />} />
                <Route path="/admin" element={<AdminUpload />} />
                <Route path="/trends" element={<TrendsDashboard />} />
                <Route path="/weekly-trends" element={<WeeklyTrendsDashboard />} />
              </Routes>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
