import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, UploadCloud, BarChart2 } from 'lucide-react';
import './Navigation.css'; // Let's create some simple styling

export const Navigation = () => {
  return (
    <nav className="main-nav">
      <div className="nav-brand">
        <h2>PDP Analytics</h2>
      </div>
      <div className="nav-links">
        <NavLink 
          to="/" 
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          <LayoutDashboard size={20} />
          <span>Local Analysis</span>
        </NavLink>
        <NavLink 
          to="/trends" 
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          <TrendingUp size={20} />
          <span>Trends Dashboard</span>
        </NavLink>
        <NavLink 
          to="/weekly-trends" 
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          <BarChart2 size={20} />
          <span>Weekly Trends</span>
        </NavLink>
        <NavLink 
          to="/admin" 
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          <UploadCloud size={20} />
          <span>Admin Upload</span>
        </NavLink>
      </div>
    </nav>
  );
};
