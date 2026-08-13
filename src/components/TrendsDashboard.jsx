import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../config/supabaseClient';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatPercent, formatPercent3 } from '../utils/formatters';
import './TrendsDashboard.css';

export const TrendsDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPlatform, setSelectedPlatform] = useState('combined');
  
  const [selectedMonthTable, setSelectedMonthTable] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'pdp_to_cart_rate', direction: 'desc' });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: metricsData, error: dbError } = await supabase
          .from('category_metrics')
          .select('*')
          .order('upload_date', { ascending: true });
          
        if (dbError) throw dbError;
        setData(metricsData || []);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch data from Supabase. Make sure the table exists and credentials are correct.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  // Get unique categories for dropdown
  const categories = useMemo(() => {
    const cats = new Set(data.map(d => d.category));
    return ['All', ...Array.from(cats)].sort();
  }, [data]);

  // Filter and format data for charts and table
  const filteredData = useMemo(() => {
    let filtered = data.filter(d => d.platform === selectedPlatform);
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(d => d.category === selectedCategory);
    }
    
    // Group by date if 'All' is selected (average the rates, sum the absolute numbers)
    // For simplicity, if 'All' is selected, we should calculate the weighted averages or just show sums.
    // Let's create an aggregated view if 'All' is selected, or just group by date.
    
    const byDate = {};
    filtered.forEach(row => {
      if (!byDate[row.upload_date]) {
        byDate[row.upload_date] = {
          upload_date: row.upload_date,
          views: 0,
          cart_adds: 0,
          purchases: 0,
          fis_users: 0,
          count: 0
        };
      }
      const d = byDate[row.upload_date];
      d.views += row.views || 0;
      d.cart_adds += row.cart_adds || 0;
      d.purchases += row.purchases || 0;
      d.fis_users += row.fis_users || 0;
      d.count++;
    });
    
    return Object.values(byDate).map(d => ({
      ...d,
      pdp_to_cart_rate: d.views > 0 ? d.cart_adds / d.views : 0,
      overall_conv_rate: d.views > 0 ? d.purchases / d.views : 0,
      fis_intent_rate: d.views > 0 ? d.fis_users / d.views : 0,
      // For chart display
      pdp_to_cart_pct: (d.views > 0 ? d.cart_adds / d.views : 0) * 100,
      purchase_pct: (d.views > 0 ? d.purchases / d.views : 0) * 100,
      fis_intent_pct: (d.views > 0 ? d.fis_users / d.views : 0) * 100,
    })).sort((a, b) => new Date(a.upload_date) - new Date(b.upload_date));
    
  }, [data, selectedCategory, selectedPlatform]);

  const months = useMemo(() => {
    const dates = new Set(data.map(d => d.upload_date));
    return Array.from(dates).sort((a, b) => new Date(b) - new Date(a));
  }, [data]);

  const activeMonthTable = selectedMonthTable || (months.length > 0 ? months[0] : '');

  const monthlyCategoryData = useMemo(() => {
    if (!activeMonthTable) return [];
    
    let filtered = data.filter(d => 
      d.upload_date === activeMonthTable && 
      d.platform === selectedPlatform && 
      d.category !== 'All'
    );
    
    return filtered.sort((a, b) => {
      let aVal = a[sortConfig.key] || 0;
      let bVal = b[sortConfig.key] || 0;
      
      // If we are sorting by string (e.g. category)
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, activeMonthTable, selectedPlatform, sortConfig]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  if (loading) {
    return <div className="trends-loading"><div className="spinner"></div> Loading Trends Data...</div>;
  }

  if (error) {
    return <div className="trends-error">{error}</div>;
  }

  return (
    <div className="trends-container">
      <div className="trends-header">
        <h2>Historical Trends Dashboard</h2>
        
        <div className="trends-filters">
          <label>
            <span>Category:</span>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="trends-select"
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          
          <label>
            <span>Platform:</span>
            <select 
              value={selectedPlatform} 
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="trends-select"
            >
              <option value="combined">Combined</option>
              <option value="web">Web</option>
              <option value="app">App</option>
            </select>
          </label>
        </div>
      </div>
      
      {filteredData.length === 0 ? (
        <div className="no-data">No data available for the selected filters. Please upload data via Admin.</div>
      ) : (
        <>
          <div className="chart-card">
            <h3>Key Metrics Trend (%)</h3>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={filteredData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="upload_date" stroke="#888" />
                  <YAxis stroke="#888" tickFormatter={(v) => `${v}%`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                    formatter={(value, name) => {
                      if (name === 'Purchase %' || name === 'FIS Intent') return `${value.toFixed(3)}%`;
                      return `${value.toFixed(1)}%`;
                    }}
                  />
                  <Legend />
                  <Line type="monotone" name="PDP to Cart" dataKey="pdp_to_cart_pct" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" name="Purchase %" dataKey="purchase_pct" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" name="FIS Intent" dataKey="fis_intent_pct" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="table-card">
            <h3>Tabular Data</h3>
            <div className="table-wrapper">
              <table className="trends-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Views</th>
                    <th>Cart Adds</th>
                    <th>Purchases</th>
                    <th>FIS Users</th>
                    <th>PDP to Cart</th>
                    <th>Purchase %</th>
                    <th>FIS Intent</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.upload_date}</td>
                      <td>{row.views.toLocaleString()}</td>
                      <td>{row.cart_adds.toLocaleString()}</td>
                      <td>{row.purchases.toLocaleString()}</td>
                      <td>{row.fis_users.toLocaleString()}</td>
                      <td>{formatPercent(row.pdp_to_cart_rate)}</td>
                      <td>{formatPercent3(row.overall_conv_rate)}</td>
                      <td>{formatPercent3(row.fis_intent_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="table-card">
            <div className="trends-header" style={{ marginBottom: '1rem', marginTop: 0 }}>
              <h3>Monthly Category Performance</h3>
              <div className="trends-filters" style={{ padding: '0.5rem 1rem' }}>
                <label>
                  <span>Month:</span>
                  <select 
                    value={activeMonthTable} 
                    onChange={(e) => setSelectedMonthTable(e.target.value)}
                    className="trends-select"
                  >
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>
            </div>
            
            <div className="table-wrapper">
              <table className="trends-table sortable-table">
                <thead>
                  <tr>
                    <th onClick={() => requestSort('category')} style={{ cursor: 'pointer', userSelect: 'none' }}>Category{getSortIndicator('category')}</th>
                    <th onClick={() => requestSort('views')} style={{ cursor: 'pointer', userSelect: 'none' }}>Views{getSortIndicator('views')}</th>
                    <th onClick={() => requestSort('cart_adds')} style={{ cursor: 'pointer', userSelect: 'none' }}>Cart Adds{getSortIndicator('cart_adds')}</th>
                    <th onClick={() => requestSort('purchases')} style={{ cursor: 'pointer', userSelect: 'none' }}>Purchases{getSortIndicator('purchases')}</th>
                    <th onClick={() => requestSort('fis_users')} style={{ cursor: 'pointer', userSelect: 'none' }}>FIS Users{getSortIndicator('fis_users')}</th>
                    <th onClick={() => requestSort('pdp_to_cart_rate')} style={{ cursor: 'pointer', userSelect: 'none' }}>PDP to Cart{getSortIndicator('pdp_to_cart_rate')}</th>
                    <th onClick={() => requestSort('overall_conv_rate')} style={{ cursor: 'pointer', userSelect: 'none' }}>Purchase %{getSortIndicator('overall_conv_rate')}</th>
                    <th onClick={() => requestSort('fis_intent_rate')} style={{ cursor: 'pointer', userSelect: 'none' }}>FIS Intent{getSortIndicator('fis_intent_rate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyCategoryData.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No category data available for this month.</td>
                    </tr>
                  ) : (
                    monthlyCategoryData.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.category}</td>
                        <td>{row.views?.toLocaleString() || '-'}</td>
                        <td>{row.cart_adds?.toLocaleString() || '-'}</td>
                        <td>{row.purchases?.toLocaleString() || '-'}</td>
                        <td>{row.fis_users?.toLocaleString() || '-'}</td>
                        <td>{formatPercent(row.pdp_to_cart_rate)}</td>
                        <td>{formatPercent3(row.overall_conv_rate)}</td>
                        <td>{formatPercent3(row.fis_intent_rate)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
