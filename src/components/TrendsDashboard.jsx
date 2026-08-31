import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../config/supabaseClient';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatPercent, formatPercent3 } from '../utils/formatters';
import { AttributeDashboard } from './AttributeDashboard';
import { exportToCSV } from '../utils/exportUtils';
import './TrendsDashboard.css';

const commonColumns = [
    { header: 'Views', accessor: 'views' },
    { header: 'Cart Adds', accessor: 'cart_adds' },
    { header: 'Purchases', accessor: 'purchases' },
    { header: 'FIS Users', accessor: 'fis_users' },
    { header: 'PDP to Cart', accessor: row => formatPercent(row.pdp_to_cart_rate) },
    { header: 'Purchase %', accessor: row => formatPercent3(row.overall_conv_rate) },
    { header: 'FIS Intent', accessor: row => formatPercent3(row.fis_intent_rate) },
    { header: 'Total Intent', accessor: row => formatPercent(row.overall_intent_rate) }
];

const tabularColumns = [
    { header: 'Date', accessor: 'upload_date' },
    ...commonColumns
];

const categoryColumns = [
    { header: 'Category', accessor: 'category' },
    ...commonColumns
];

const materialColumns = [
    { header: 'Material Type', accessor: 'material_type' },
    ...commonColumns
];

export const TrendsDashboard = () => {
  const [activeTab, setActiveTab] = useState('time'); // 'time' or 'attribute'
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPlatform, setSelectedPlatform] = useState('combined');
  
  const [excludedCategories, setExcludedCategories] = useState([]);
  const [excludeDropdownOpen, setExcludeDropdownOpen] = useState(false);
  
  const [selectedStartMonth, setSelectedStartMonth] = useState('');
  const [selectedEndMonth, setSelectedEndMonth] = useState('');
  
  const [compareMonthA, setCompareMonthA] = useState('');
  const [compareMonthB, setCompareMonthB] = useState('');

  const [materialCategory, setMaterialCategory] = useState('All');
  const [materialMonth, setMaterialMonth] = useState('');
  
  const [sortConfig, setSortConfig] = useState({ key: 'pdp_to_cart_rate', direction: 'desc' });
  const [compareSortConfig, setCompareSortConfig] = useState({ key: 'category', direction: 'asc' });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let allData = [];
        let hasMore = true;
        let start = 0;
        const PAGE_SIZE = 1000;
        
        while (hasMore) {
          const { data: metricsData, error: dbError } = await supabase
            .from('category_material_metrics')
            .select('*')
            .order('upload_date', { ascending: true })
            .range(start, start + PAGE_SIZE - 1);
            
          if (dbError) throw dbError;
          
          if (metricsData && metricsData.length > 0) {
            allData = [...allData, ...metricsData];
            start += PAGE_SIZE;
            if (metricsData.length < PAGE_SIZE) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }
        
        setData(allData);
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
    const cats = new Set(data.map(d => (!d.category || d.category === 'N/A') ? 'Uncategorized' : d.category));
    return ['All', ...Array.from(cats)].sort();
  }, [data]);

  // Filter and format data for charts and table
  const filteredData = useMemo(() => {
    let filtered = data.filter(d => d.platform === selectedPlatform);
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(d => d.category === selectedCategory);
    } else if (excludedCategories.length > 0) {
      filtered = filtered.filter(d => !excludedCategories.includes(d.category));
    }
    
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
      overall_intent_rate: d.views > 0 ? (d.cart_adds + d.fis_users) / d.views : 0,
      pdp_to_cart_pct: (d.views > 0 ? d.cart_adds / d.views : 0) * 100,
      purchase_pct: (d.views > 0 ? d.purchases / d.views : 0) * 100,
      fis_intent_pct: (d.views > 0 ? d.fis_users / d.views : 0) * 100,
      overall_intent_pct: (d.views > 0 ? (d.cart_adds + d.fis_users) / d.views : 0) * 100,
    })).sort((a, b) => new Date(a.upload_date) - new Date(b.upload_date));
    
  }, [data, selectedCategory, selectedPlatform, excludedCategories]);

  const months = useMemo(() => {
    const dates = new Set(data.map(d => d.upload_date));
    return Array.from(dates).sort((a, b) => new Date(b) - new Date(a));
  }, [data]);

  const activeStartMonth = selectedStartMonth || (months.length > 0 ? months[0] : '');
  const activeEndMonth = selectedEndMonth || (months.length > 0 ? months[0] : '');
  const activeMaterialMonth = materialMonth || (months.length > 0 ? months[0] : '');
  const activeCompareMonthA = compareMonthA || (months.length > 1 ? months[1] : (months.length > 0 ? months[0] : ''));
  const activeCompareMonthB = compareMonthB || (months.length > 0 ? months[0] : '');

  const monthlyCategoryData = useMemo(() => {
    if (!activeStartMonth || !activeEndMonth) return [];
    
    // Sort dates just in case start > end
    const sortedDates = [activeStartMonth, activeEndMonth].sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[1];

    let filtered = data.filter(d => 
      d.upload_date >= startDate && 
      d.upload_date <= endDate &&
      d.platform === selectedPlatform
    );

    const byCategory = {};
    filtered.forEach(row => {
      const cat = (!row.category || row.category === 'N/A') ? 'Uncategorized' : row.category;
      
      if (excludedCategories.length > 0 && excludedCategories.includes(cat)) return;
      
      if (!byCategory[cat]) {
        byCategory[cat] = {
          category: cat,
          views: 0,
          cart_adds: 0,
          purchases: 0,
          fis_users: 0,
        };
      }
      const c = byCategory[cat];
      c.views += row.views || 0;
      c.cart_adds += row.cart_adds || 0;
      c.purchases += row.purchases || 0;
      c.fis_users += row.fis_users || 0;
    });

    const aggregated = Object.values(byCategory).map(c => ({
      ...c,
      pdp_to_cart_rate: c.views > 0 ? c.cart_adds / c.views : 0,
      overall_conv_rate: c.views > 0 ? c.purchases / c.views : 0,
      fis_intent_rate: c.views > 0 ? c.fis_users / c.views : 0,
      overall_intent_rate: c.views > 0 ? (c.cart_adds + c.fis_users) / c.views : 0
    }));
    
    return aggregated.sort((a, b) => {
      let aVal = a[sortConfig.key] || 0;
      let bVal = b[sortConfig.key] || 0;
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, activeStartMonth, activeEndMonth, selectedPlatform, sortConfig, excludedCategories, selectedCategory]);

  const monthlyCategoryTotals = useMemo(() => {
    const totals = {
      views: 0,
      cart_adds: 0,
      purchases: 0,
      fis_users: 0,
    };
    monthlyCategoryData.forEach(row => {
      totals.views += row.views || 0;
      totals.cart_adds += row.cart_adds || 0;
      totals.purchases += row.purchases || 0;
      totals.fis_users += row.fis_users || 0;
    });
    return {
      ...totals,
      pdp_to_cart_rate: totals.views > 0 ? totals.cart_adds / totals.views : 0,
      overall_conv_rate: totals.views > 0 ? totals.purchases / totals.views : 0,
      fis_intent_rate: totals.views > 0 ? totals.fis_users / totals.views : 0,
      overall_intent_rate: totals.views > 0 ? (totals.cart_adds + totals.fis_users) / totals.views : 0,
    };
  }, [monthlyCategoryData]);

  const categoryComparisonData = useMemo(() => {
    if (!activeCompareMonthA || !activeCompareMonthB) return [];

    const getMonthData = (monthStr) => {
      let filtered = data.filter(d => 
        d.upload_date === monthStr &&
        d.platform === selectedPlatform
      );
      
      const byCategory = {};
      filtered.forEach(row => {
        const cat = (!row.category || row.category === 'N/A') ? 'Uncategorized' : row.category;
        if (excludedCategories.length > 0 && excludedCategories.includes(cat)) return;
        
        if (!byCategory[cat]) {
          byCategory[cat] = { views: 0, cart_adds: 0, purchases: 0, fis_users: 0 };
        }
        byCategory[cat].views += row.views || 0;
        byCategory[cat].cart_adds += row.cart_adds || 0;
        byCategory[cat].purchases += row.purchases || 0;
        byCategory[cat].fis_users += row.fis_users || 0;
      });
      
      Object.values(byCategory).forEach(c => {
        c.pdp_to_cart_rate = c.views > 0 ? c.cart_adds / c.views : 0;
        c.overall_conv_rate = c.views > 0 ? c.purchases / c.views : 0;
        c.fis_intent_rate = c.views > 0 ? c.fis_users / c.views : 0;
        c.overall_intent_rate = c.views > 0 ? (c.cart_adds + c.fis_users) / c.views : 0;
      });
      return byCategory;
    };

    const dataA = getMonthData(activeCompareMonthA);
    const dataB = getMonthData(activeCompareMonthB);

    const allCategories = new Set([...Object.keys(dataA), ...Object.keys(dataB)]);
    const comparison = [];

    allCategories.forEach(cat => {
      const a = dataA[cat] || { views: 0, cart_adds: 0, purchases: 0, fis_users: 0, pdp_to_cart_rate: 0, overall_conv_rate: 0, fis_intent_rate: 0, overall_intent_rate: 0 };
      const b = dataB[cat] || { views: 0, cart_adds: 0, purchases: 0, fis_users: 0, pdp_to_cart_rate: 0, overall_conv_rate: 0, fis_intent_rate: 0, overall_intent_rate: 0 };

      comparison.push({
        category: cat,
        viewsA: a.views, viewsB: b.views, viewsDiff: b.views - a.views, viewsPct: a.views > 0 ? (b.views - a.views) / a.views : (b.views > 0 ? 1 : 0),
        cartAddsA: a.cart_adds, cartAddsB: b.cart_adds, cartAddsDiff: b.cart_adds - a.cart_adds, cartAddsPct: a.cart_adds > 0 ? (b.cart_adds - a.cart_adds) / a.cart_adds : (b.cart_adds > 0 ? 1 : 0),
        purchasesA: a.purchases, purchasesB: b.purchases, purchasesDiff: b.purchases - a.purchases, purchasesPct: a.purchases > 0 ? (b.purchases - a.purchases) / a.purchases : (b.purchases > 0 ? 1 : 0),
        fisUsersA: a.fis_users, fisUsersB: b.fis_users, fisUsersDiff: b.fis_users - a.fis_users, fisUsersPct: a.fis_users > 0 ? (b.fis_users - a.fis_users) / a.fis_users : (b.fis_users > 0 ? 1 : 0),
        
        pdpToCartA: a.pdp_to_cart_rate, pdpToCartB: b.pdp_to_cart_rate, pdpToCartDiff: b.pdp_to_cart_rate - a.pdp_to_cart_rate,
        convRateA: a.overall_conv_rate, convRateB: b.overall_conv_rate, convRateDiff: b.overall_conv_rate - a.overall_conv_rate,
        fisIntentA: a.fis_intent_rate, fisIntentB: b.fis_intent_rate, fisIntentDiff: b.fis_intent_rate - a.fis_intent_rate,
        overallIntentA: a.overall_intent_rate, overallIntentB: b.overall_intent_rate, overallIntentDiff: b.overall_intent_rate - a.overall_intent_rate,
      });
    });

    return comparison.sort((a, b) => {
      let aVal = a[compareSortConfig.key] || 0;
      let bVal = b[compareSortConfig.key] || 0;
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return compareSortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      if (aVal < bVal) return compareSortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return compareSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, activeCompareMonthA, activeCompareMonthB, selectedPlatform, excludedCategories, compareSortConfig]);

  const exportComparisonToCSV = () => {
    const csvRows = [];
    const headers = [
      'Category',
      `Views (${activeCompareMonthA})`, `Views (${activeCompareMonthB})`, `Views Diff`, `Views % Change`,
      `Cart Adds (${activeCompareMonthA})`, `Cart Adds (${activeCompareMonthB})`, `Cart Adds Diff`, `Cart Adds % Change`,
      `Purchases (${activeCompareMonthA})`, `Purchases (${activeCompareMonthB})`, `Purchases Diff`, `Purchases % Change`,
      `FIS Users (${activeCompareMonthA})`, `FIS Users (${activeCompareMonthB})`, `FIS Users Diff`, `FIS Users % Change`,
      `PDP to Cart (${activeCompareMonthA})`, `PDP to Cart (${activeCompareMonthB})`, `PDP to Cart Diff`,
      `Purchase % (${activeCompareMonthA})`, `Purchase % (${activeCompareMonthB})`, `Purchase % Diff`,
      `FIS Intent (${activeCompareMonthA})`, `FIS Intent (${activeCompareMonthB})`, `FIS Intent Diff`,
      `Total Intent (${activeCompareMonthA})`, `Total Intent (${activeCompareMonthB})`, `Total Intent Diff`
    ];
    csvRows.push(headers.join(','));

    categoryComparisonData.forEach(row => {
      const vals = [
        `"${row.category}"`,
        row.viewsA, row.viewsB, row.viewsDiff, `${(row.viewsPct * 100).toFixed(1)}%`,
        row.cartAddsA, row.cartAddsB, row.cartAddsDiff, `${(row.cartAddsPct * 100).toFixed(1)}%`,
        row.purchasesA, row.purchasesB, row.purchasesDiff, `${(row.purchasesPct * 100).toFixed(1)}%`,
        row.fisUsersA, row.fisUsersB, row.fisUsersDiff, `${(row.fisUsersPct * 100).toFixed(1)}%`,
        `${(row.pdpToCartA * 100).toFixed(1)}%`, `${(row.pdpToCartB * 100).toFixed(1)}%`, `${(row.pdpToCartDiff * 100).toFixed(1)}%`,
        `${(row.convRateA * 100).toFixed(3)}%`, `${(row.convRateB * 100).toFixed(3)}%`, `${(row.convRateDiff * 100).toFixed(3)}%`,
        `${(row.fisIntentA * 100).toFixed(3)}%`, `${(row.fisIntentB * 100).toFixed(3)}%`, `${(row.fisIntentDiff * 100).toFixed(3)}%`,
        `${(row.overallIntentA * 100).toFixed(1)}%`, `${(row.overallIntentB * 100).toFixed(1)}%`, `${(row.overallIntentDiff * 100).toFixed(1)}%`
      ];
      csvRows.push(vals.join(','));
    });

    const csvData = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const csvUrl = URL.createObjectURL(csvData);
    const link = document.createElement('a');
    link.href = csvUrl;
    link.download = `category_comparison_${activeCompareMonthA}_vs_${activeCompareMonthB}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const monthlyMaterialData = useMemo(() => {
    if (!activeMaterialMonth) return [];
    
    let filtered = data.filter(d => 
      d.upload_date === activeMaterialMonth && 
      d.platform === selectedPlatform
    );
    
    if (materialCategory !== 'All') {
      filtered = filtered.filter(d => d.category === materialCategory);
    } else if (excludedCategories.length > 0) {
      filtered = filtered.filter(d => !excludedCategories.includes(d.category));
    }
    
    const byMaterial = {};
    filtered.forEach(row => {
      const mat = row.material_type || 'Other/Unspecified';
      if (!byMaterial[mat]) {
        byMaterial[mat] = {
          material_type: mat,
          views: 0,
          cart_adds: 0,
          purchases: 0,
          fis_users: 0,
        };
      }
      const c = byMaterial[mat];
      c.views += row.views || 0;
      c.cart_adds += row.cart_adds || 0;
      c.purchases += row.purchases || 0;
      c.fis_users += row.fis_users || 0;
    });

    const aggregated = Object.values(byMaterial).map(c => ({
      ...c,
      pdp_to_cart_rate: c.views > 0 ? c.cart_adds / c.views : 0,
      overall_conv_rate: c.views > 0 ? c.purchases / c.views : 0,
      fis_intent_rate: c.views > 0 ? c.fis_users / c.views : 0,
      overall_intent_rate: c.views > 0 ? (c.cart_adds + c.fis_users) / c.views : 0
    }));
    
    return aggregated.sort((a, b) => b.views - a.views);
  }, [data, activeMaterialMonth, selectedPlatform, materialCategory, excludedCategories]);

  const monthlyMaterialTotals = useMemo(() => {
    const totals = {
      views: 0,
      cart_adds: 0,
      purchases: 0,
      fis_users: 0,
    };
    monthlyMaterialData.forEach(row => {
      totals.views += row.views || 0;
      totals.cart_adds += row.cart_adds || 0;
      totals.purchases += row.purchases || 0;
      totals.fis_users += row.fis_users || 0;
    });
    return {
      ...totals,
      pdp_to_cart_rate: totals.views > 0 ? totals.cart_adds / totals.views : 0,
      overall_conv_rate: totals.views > 0 ? totals.purchases / totals.views : 0,
      fis_intent_rate: totals.views > 0 ? totals.fis_users / totals.views : 0,
      overall_intent_rate: totals.views > 0 ? (totals.cart_adds + totals.fis_users) / totals.views : 0,
    };
  }, [monthlyMaterialData]);

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

  const requestCompareSort = (key) => {
    let direction = 'desc';
    if (compareSortConfig.key === key && compareSortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setCompareSortConfig({ key, direction });
  };

  const getCompareSortIndicator = (key) => {
    if (compareSortConfig.key === key) {
      return compareSortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  return (
    <div className="trends-container">
      <div className="trends-header">
        <h2>Analytics Dashboard</h2>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button 
                onClick={() => setActiveTab('time')} 
                style={{ padding: '0.5rem 1rem', background: activeTab === 'time' ? '#3b82f6' : '#333', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}
            >
                Historical Trends
            </button>
            <button 
                onClick={() => setActiveTab('attribute')} 
                style={{ padding: '0.5rem 1rem', background: activeTab === 'attribute' ? '#3b82f6' : '#333', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}
            >
                Attribute Breakdown
            </button>
        </div>
      </div>
      
      {activeTab === 'attribute' ? (
          <AttributeDashboard />
      ) : (
          <>
            {loading && <div className="trends-loading"><div className="spinner"></div> Loading Trends Data...</div>}
            {error && <div className="trends-error">{error}</div>}
            
            {!loading && !error && (
              <>
                <div className="trends-filters" style={{ marginBottom: '2rem' }}>
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

          {selectedCategory === 'All' && (
            <label style={{ position: 'relative' }}>
              <span>Exclude:</span>
              <div 
                onClick={() => setExcludeDropdownOpen(!excludeDropdownOpen)}
                className="trends-select" 
                style={{ cursor: 'pointer', minWidth: '150px', background: '#333', padding: '0.4rem', borderRadius: '4px', border: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{excludedCategories.length > 0 ? `${excludedCategories.length} excluded` : 'None'}</span>
                <span style={{ fontSize: '0.8rem' }}>▼</span>
              </div>
              {excludeDropdownOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10, background: '#1f2937', border: '1px solid #374151', borderRadius: '4px', maxHeight: '300px', overflowY: 'auto', padding: '0.5rem', marginTop: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', minWidth: '200px' }}>
                  {categories.filter(c => c !== 'All').map(c => (
                    <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.4rem 0', cursor: 'pointer', fontWeight: 'normal' }}>
                      <input 
                        type="checkbox" 
                        checked={excludedCategories.includes(c)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setExcludedCategories([...excludedCategories, c]);
                          } else {
                            setExcludedCategories(excludedCategories.filter(ex => ex !== c));
                          }
                        }}
                      />
                      <span style={{ fontSize: '0.85rem' }}>{c}</span>
                    </label>
                  ))}
                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #374151', textAlign: 'center' }}>
                    <button 
                      onClick={() => setExcludeDropdownOpen(false)}
                      style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </label>
          )}
          
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Tabular Data</h3>
              <button 
                onClick={() => exportToCSV(filteredData, tabularColumns, 'tabular_data.csv')}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px' }}
              >
                Download CSV
              </button>
            </div>
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
                    <th>Total Intent</th>
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
                      <td>{formatPercent(row.overall_intent_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="table-card">
            <div className="trends-header" style={{ marginBottom: '1rem', marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>Monthly Category Performance</h3>
                <button 
                  onClick={() => exportToCSV(monthlyCategoryData, categoryColumns, `category_performance_${activeStartMonth}_to_${activeEndMonth}.csv`)}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px' }}
                >
                  Download CSV
                </button>
              </div>
              <div className="trends-filters" style={{ padding: '0.5rem 1rem', display: 'flex', gap: '1rem' }}>
                <label>
                  <span>Start Month:</span>
                  <select 
                    value={activeStartMonth} 
                    onChange={(e) => setSelectedStartMonth(e.target.value)}
                    className="trends-select"
                  >
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label>
                  <span>End Month:</span>
                  <select 
                    value={activeEndMonth} 
                    onChange={(e) => setSelectedEndMonth(e.target.value)}
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
                    <th onClick={() => requestSort('overall_intent_rate')} style={{ cursor: 'pointer', userSelect: 'none' }}>Total Intent{getSortIndicator('overall_intent_rate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyCategoryData.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>No category data available for this month.</td>
                    </tr>
                  ) : (
                    <>
                      {monthlyCategoryData.map((row, idx) => (
                        <tr 
                          key={idx} 
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            const url = `/category/${encodeURIComponent(row.category)}?start=${activeStartMonth}&end=${activeEndMonth}&platform=${selectedPlatform}`;
                            window.open(url, '_blank');
                          }}
                          className="clickable-row"
                        >
                          <td style={{ color: '#3b82f6', textDecoration: 'underline' }}>{row.category}</td>
                          <td>{row.views?.toLocaleString() || '-'}</td>
                          <td>{row.cart_adds?.toLocaleString() || '-'}</td>
                          <td>{row.purchases?.toLocaleString() || '-'}</td>
                          <td>{row.fis_users?.toLocaleString() || '-'}</td>
                          <td>{formatPercent(row.pdp_to_cart_rate)}</td>
                          <td>{formatPercent3(row.overall_conv_rate)}</td>
                          <td>{formatPercent3(row.fis_intent_rate)}</td>
                          <td>{formatPercent(row.overall_intent_rate)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 'bold', background: '#222', borderTop: '2px solid #444' }}>
                        <td>Total</td>
                        <td>{monthlyCategoryTotals.views.toLocaleString()}</td>
                        <td>{monthlyCategoryTotals.cart_adds.toLocaleString()}</td>
                        <td>{monthlyCategoryTotals.purchases.toLocaleString()}</td>
                        <td>{monthlyCategoryTotals.fis_users.toLocaleString()}</td>
                        <td>{formatPercent(monthlyCategoryTotals.pdp_to_cart_rate)}</td>
                        <td>{formatPercent3(monthlyCategoryTotals.overall_conv_rate)}</td>
                        <td>{formatPercent3(monthlyCategoryTotals.fis_intent_rate)}</td>
                        <td>{formatPercent(monthlyCategoryTotals.overall_intent_rate)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="table-card">
            <div className="trends-header" style={{ marginBottom: '1rem', marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>Month-over-Month Category Comparison</h3>
                <button 
                  onClick={exportComparisonToCSV}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px' }}
                >
                  Download CSV
                </button>
              </div>
              <div className="trends-filters" style={{ padding: '0.5rem 1rem', display: 'flex', gap: '1rem' }}>
                <label>
                  <span>Month A (Base):</span>
                  <select 
                    value={activeCompareMonthA} 
                    onChange={(e) => setCompareMonthA(e.target.value)}
                    className="trends-select"
                  >
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label>
                  <span>Month B (Compare):</span>
                  <select 
                    value={activeCompareMonthB} 
                    onChange={(e) => setCompareMonthB(e.target.value)}
                    className="trends-select"
                  >
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>
            </div>
            
            <div className="table-wrapper">
              <table className="trends-table sortable-table" style={{ fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th onClick={() => requestCompareSort('category')} style={{ cursor: 'pointer', userSelect: 'none' }}>Category{getCompareSortIndicator('category')}</th>
                    <th onClick={() => requestCompareSort('viewsDiff')} style={{ cursor: 'pointer', userSelect: 'none' }}>Views (A → B){getCompareSortIndicator('viewsDiff')}</th>
                    <th onClick={() => requestCompareSort('cartAddsDiff')} style={{ cursor: 'pointer', userSelect: 'none' }}>Cart Adds (A → B){getCompareSortIndicator('cartAddsDiff')}</th>
                    <th onClick={() => requestCompareSort('purchasesDiff')} style={{ cursor: 'pointer', userSelect: 'none' }}>Purchases (A → B){getCompareSortIndicator('purchasesDiff')}</th>
                    <th onClick={() => requestCompareSort('fisUsersDiff')} style={{ cursor: 'pointer', userSelect: 'none' }}>FIS Users (A → B){getCompareSortIndicator('fisUsersDiff')}</th>
                    <th onClick={() => requestCompareSort('pdpToCartDiff')} style={{ cursor: 'pointer', userSelect: 'none' }}>PDP to Cart (A → B){getCompareSortIndicator('pdpToCartDiff')}</th>
                    <th onClick={() => requestCompareSort('convRateDiff')} style={{ cursor: 'pointer', userSelect: 'none' }}>Purchase % (A → B){getCompareSortIndicator('convRateDiff')}</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryComparisonData.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No data to compare.</td>
                    </tr>
                  ) : (
                    categoryComparisonData.map((row, idx) => {
                      const renderDeltaNum = (valA, valB, pctChange) => {
                        const isPositive = valB > valA;
                        const isNegative = valB < valA;
                        const color = isPositive ? '#10b981' : (isNegative ? '#ef4444' : '#888');
                        const sign = isPositive ? '+' : '';
                        return (
                          <span>
                            {valA.toLocaleString()} → {valB.toLocaleString()}{' '}
                            <span style={{ color, fontSize: '0.85em', fontWeight: 'bold' }}>
                              ({sign}{(pctChange * 100).toFixed(1)}%)
                            </span>
                          </span>
                        );
                      };
                      
                      const renderDeltaPct = (valA, valB, diff, decimals=1) => {
                        const isPositive = diff > 0;
                        const isNegative = diff < 0;
                        const color = isPositive ? '#10b981' : (isNegative ? '#ef4444' : '#888');
                        const sign = isPositive ? '+' : '';
                        return (
                          <span>
                            {(valA * 100).toFixed(decimals)}% → {(valB * 100).toFixed(decimals)}%{' '}
                            <span style={{ color, fontSize: '0.85em', fontWeight: 'bold' }}>
                              ({sign}{(diff * 100).toFixed(decimals)}%)
                            </span>
                          </span>
                        );
                      };

                      return (
                        <tr key={idx}>
                          <td style={{ fontWeight: 'bold' }}>{row.category}</td>
                          <td>{renderDeltaNum(row.viewsA, row.viewsB, row.viewsPct)}</td>
                          <td>{renderDeltaNum(row.cartAddsA, row.cartAddsB, row.cartAddsPct)}</td>
                          <td>{renderDeltaNum(row.purchasesA, row.purchasesB, row.purchasesPct)}</td>
                          <td>{renderDeltaNum(row.fisUsersA, row.fisUsersB, row.fisUsersPct)}</td>
                          <td>{renderDeltaPct(row.pdpToCartA, row.pdpToCartB, row.pdpToCartDiff, 1)}</td>
                          <td>{renderDeltaPct(row.convRateA, row.convRateB, row.convRateDiff, 3)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="table-card">
            <div className="trends-header" style={{ marginBottom: '1rem', marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>Material Type Breakdown</h3>
                <button 
                  onClick={() => exportToCSV(monthlyMaterialData, materialColumns, `material_breakdown_${activeMaterialMonth || 'all'}.csv`)}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px' }}
                >
                  Download CSV
                </button>
              </div>
              <div className="trends-filters" style={{ padding: '0.5rem 1rem', display: 'flex', gap: '1rem' }}>
                <label>
                  <span>Month:</span>
                  <select 
                    value={activeMaterialMonth} 
                    onChange={(e) => setMaterialMonth(e.target.value)}
                    className="trends-select"
                  >
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label>
                  <span>Category:</span>
                  <select 
                    value={materialCategory} 
                    onChange={(e) => setMaterialCategory(e.target.value)}
                    className="trends-select"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
            </div>
            
            <div className="table-wrapper">
              <table className="trends-table">
                <thead>
                  <tr>
                    <th>Material Type</th>
                    <th>Views</th>
                    <th>Cart Adds</th>
                    <th>Purchases</th>
                    <th>FIS Users</th>
                    <th>PDP to Cart</th>
                    <th>Purchase %</th>
                    <th>FIS Intent</th>
                    <th>Total Intent</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyMaterialData.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>No material type data available.</td>
                    </tr>
                  ) : (
                    <>
                      {monthlyMaterialData.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.material_type}</td>
                          <td>{row.views?.toLocaleString() || '-'}</td>
                          <td>{row.cart_adds?.toLocaleString() || '-'}</td>
                          <td>{row.purchases?.toLocaleString() || '-'}</td>
                          <td>{row.fis_users?.toLocaleString() || '-'}</td>
                          <td>{formatPercent(row.pdp_to_cart_rate)}</td>
                          <td>{formatPercent3(row.overall_conv_rate)}</td>
                          <td>{formatPercent3(row.fis_intent_rate)}</td>
                          <td>{formatPercent(row.overall_intent_rate)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 'bold', background: '#222', borderTop: '2px solid #444' }}>
                        <td>Total</td>
                        <td>{monthlyMaterialTotals.views.toLocaleString()}</td>
                        <td>{monthlyMaterialTotals.cart_adds.toLocaleString()}</td>
                        <td>{monthlyMaterialTotals.purchases.toLocaleString()}</td>
                        <td>{monthlyMaterialTotals.fis_users.toLocaleString()}</td>
                        <td>{formatPercent(monthlyMaterialTotals.pdp_to_cart_rate)}</td>
                        <td>{formatPercent3(monthlyMaterialTotals.overall_conv_rate)}</td>
                        <td>{formatPercent3(monthlyMaterialTotals.fis_intent_rate)}</td>
                        <td>{formatPercent(monthlyMaterialTotals.overall_intent_rate)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </>
      )}
      </>
      )}

    </div>
  );
};
