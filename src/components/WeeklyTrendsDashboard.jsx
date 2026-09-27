import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../config/supabaseClient';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { formatPercent, formatPercent3 } from '../utils/formatters';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { exportToCSV } from '../utils/exportUtils';
import './WeeklyTrendsDashboard.css';

const MOCK_DATA = [
  { id: '1', week_label: '1-7th July', upload_date: '2024-07-01', views: 9921, cart_adds: 2976, purchases: 0, fis_users: 0, category: 'All', platform: 'combined' },
  { id: '2', week_label: '8-14th July', upload_date: '2024-07-08', views: 10940, cart_adds: 3063, purchases: 0, fis_users: 0, category: 'All', platform: 'combined' },
  { id: '3', week_label: '15-20th July', upload_date: '2024-07-15', views: 12584, cart_adds: 3536, purchases: 0, fis_users: 0, category: 'All', platform: 'combined' }
];

const categoryColumns = [
    { header: 'Category', accessor: 'category' },
    { header: 'Views', accessor: 'views' },
    { header: 'Cart Adds', accessor: 'cart_adds' },
    { header: 'Purchases', accessor: 'purchases' },
    { header: 'FIS Users', accessor: 'fis_users' },
    { header: 'PDP to Cart', accessor: row => formatPercent(row.pdp_to_cart_rate) },
    { header: 'Purchase %', accessor: row => formatPercent3(row.overall_conv_rate) },
    { header: 'FIS Intent', accessor: row => formatPercent3(row.fis_intent_rate) },
    { header: 'Total Intent', accessor: row => formatPercent(row.overall_intent_rate) }
];

export const WeeklyTrendsDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Top level filters
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPlatform, setSelectedPlatform] = useState('combined');
  const [primaryMetric, setPrimaryMetric] = useState('views');

  // Weekly Category Performance filters
  const [activeStartWeek, setActiveStartWeek] = useState('');
  const [activeEndWeek, setActiveEndWeek] = useState('');

  // Comparison filters
  const [compareWeekA, setCompareWeekA] = useState('');
  const [compareWeekB, setCompareWeekB] = useState('');
  
  const [expandedCategories, setExpandedCategories] = useState([]);
  const [expandedMatrixCategories, setExpandedMatrixCategories] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: metrics, error: dbError } = await supabase
          .from('weekly_performance_metrics')
          .select('*')
          .order('upload_date', { ascending: true });
          
        if (dbError) throw dbError;
        
        if (metrics && metrics.length > 0) {
          setData(metrics);
        } else {
          setData(MOCK_DATA);
        }
      } catch (err) {
        console.error(err);
        setData(MOCK_DATA);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const weekMap = useMemo(() => {
    const map = {};
    data.forEach(d => {
      if (d.upload_date && d.week_label) {
        map[d.upload_date] = d.week_label;
      }
    });
    return map;
  }, [data]);

  const weeks = useMemo(() => {
    const dates = new Set(data.map(d => d.upload_date));
    return Array.from(dates).sort((a, b) => new Date(a) - new Date(b));
  }, [data]);

  const categories = useMemo(() => {
    const cats = new Set(data.map(d => (!d.category || d.category === 'N/A') ? 'Uncategorized' : d.category));
    return ['All', ...Array.from(cats)].sort();
  }, [data]);

  useEffect(() => {
    if (weeks.length > 0) {
      if (!activeStartWeek) setActiveStartWeek(weeks[0]);
      if (!activeEndWeek) setActiveEndWeek(weeks[weeks.length - 1]);
      if (!compareWeekA) setCompareWeekA(weeks.length > 1 ? weeks[weeks.length - 2] : weeks[0]);
      if (!compareWeekB) setCompareWeekB(weeks[weeks.length - 1]);
    }
  }, [weeks]);

  // 1. Filter and format data for Top Chart and Table
  const filteredData = useMemo(() => {
    let filtered = data.filter(d => (d.platform || 'combined') === selectedPlatform);
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(d => (d.category || 'All') === selectedCategory);
    }
    
    const byWeek = {};
    filtered.forEach(row => {
      const key = row.upload_date;
      if (!byWeek[key]) {
        byWeek[key] = {
          upload_date: key,
          week_label: row.week_label || key,
          views: 0, cart_adds: 0, purchases: 0, fis_users: 0,
        };
      }
      const d = byWeek[key];
      d.views += row.views || 0;
      d.cart_adds += row.cart_adds || 0;
      d.purchases += row.purchases || 0;
      d.fis_users += row.fis_users || 0;
    });
    
    const aggregated = Object.values(byWeek).sort((a, b) => new Date(a.upload_date) - new Date(b.upload_date));
    
    return aggregated.map((d, index, arr) => {
      const pdp_to_cart_rate = d.views > 0 ? d.cart_adds / d.views : 0;
      const overall_conv_rate = d.views > 0 ? d.purchases / d.views : 0;
      const fis_intent_rate = d.views > 0 ? d.fis_users / d.views : 0;
      const overall_intent_rate = d.views > 0 ? (d.cart_adds + d.fis_users) / d.views : 0;
      
      let wow = null;
      let isBase = index === 0;
      
      if (!isBase && arr[index - 1]) {
        const prevValue = arr[index - 1][primaryMetric];
        const currentValue = d[primaryMetric];
        if (prevValue > 0) {
          wow = ((currentValue - prevValue) / prevValue) * 100;
        }
      }
      
      return {
        ...d,
        pdp_to_cart_rate, overall_conv_rate, fis_intent_rate, overall_intent_rate,
        pdp_to_cart_pct: pdp_to_cart_rate * 100,
        purchase_pct: overall_conv_rate * 100,
        fis_intent_pct: fis_intent_rate * 100,
        overall_intent_pct: overall_intent_rate * 100,
        wow, isBase
      };
    });
  }, [data, selectedCategory, selectedPlatform, primaryMetric]);

  const latest4Data = filteredData.slice(-4);

  // 2. Weekly Category Performance
  const weeklyCategoryData = useMemo(() => {
    if (!activeStartWeek || !activeEndWeek) return [];
    
    const sortedDates = [activeStartWeek, activeEndWeek].sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[1];

    let filtered = data.filter(d => 
      d.upload_date >= startDate && 
      d.upload_date <= endDate &&
      (d.platform || 'combined') === selectedPlatform
    );

    const byCategory = {};
    filtered.forEach(row => {
      const cat = (!row.category || row.category === 'N/A') ? 'Uncategorized' : row.category;
      if (!byCategory[cat]) {
        byCategory[cat] = { category: cat, views: 0, cart_adds: 0, purchases: 0, fis_users: 0 };
      }
      const c = byCategory[cat];
      
       c.views += row.views || 0;
       c.cart_adds += row.cart_adds || 0;
       c.purchases += row.purchases || 0;
       c.fis_users += row.fis_users || 0;
       c.total_intent = c.cart_adds + c.fis_users;
    });

    return Object.values(byCategory).map(c => ({
      ...c,
      pdp_to_cart_rate: c.views > 0 ? c.cart_adds / c.views : 0,
      overall_conv_rate: c.views > 0 ? c.purchases / c.views : 0,
      fis_intent_rate: c.views > 0 ? c.fis_users / c.views : 0,
      overall_intent_rate: c.views > 0 ? (c.cart_adds + c.fis_users) / c.views : 0
    })).sort((a, b) => b.views - a.views);
  }, [data, activeStartWeek, activeEndWeek, selectedPlatform]);

  // 3. Week-over-Week Category Comparison (A vs B)
  const categoryComparisonData = useMemo(() => {
    if (!compareWeekA || !compareWeekB) return [];

    const getWeekData = (weekDate) => {
      let filtered = data.filter(d => 
        d.upload_date === weekDate &&
        (d.platform || 'combined') === selectedPlatform
      );
      
      const byCategory = {};
      filtered.forEach(row => {
        const cat = (!row.category || row.category === 'N/A') ? 'Uncategorized' : row.category;
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

    const dataA = getWeekData(compareWeekA);
    const dataB = getWeekData(compareWeekB);

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

    return comparison.sort((a, b) => a.viewsPct - b.viewsPct);
  }, [data, compareWeekA, compareWeekB, selectedPlatform]);

  // 4. Multi-Week Trend Matrix Data (WoW Growth + Sparklines)
  const trendMatrixData = useMemo(() => {
    const latest4Weeks = weeks.slice(-4);
    if (latest4Weeks.length === 0) return { weeks: [], categories: [], map: {} };
    
    // We also need the week *before* the first of the latest 4 to calc WoW for the first column
    const latest5Weeks = weeks.slice(-5);
    
    const byCategory = {};
    const filtered = data.filter(d => (d.platform || 'combined') === selectedPlatform);
    
    filtered.forEach(row => {
       const cat = (!row.category || row.category === 'N/A') ? 'Uncategorized' : row.category;
       if (!latest5Weeks.includes(row.upload_date)) return;
       
       if (!byCategory[cat]) {
          byCategory[cat] = {};
          latest5Weeks.forEach(w => {
             byCategory[cat][w] = { views: 0, cart_adds: 0, purchases: 0, fis_users: 0 };
          });
       }
       
       const c = byCategory[cat][row.upload_date];
       c.views += row.views || 0;
       c.cart_adds += row.cart_adds || 0;
       c.purchases += row.purchases || 0;
       c.fis_users += row.fis_users || 0;
       c.total_intent = c.cart_adds + c.fis_users;
    });
    
    // Calculate WoW % and build Sparkline array
    Object.keys(byCategory).forEach(cat => {
       latest4Weeks.forEach(w => {
          const c = byCategory[cat][w];
          const prevW = latest5Weeks[latest5Weeks.indexOf(w) - 1];
          const prev = prevW ? byCategory[cat][prevW] : null;
          
          c.wow_views = (prev && prev.views > 0) ? (c.views - prev.views) / prev.views : 0;
          c.wow_cart = (prev && prev.cart_adds > 0) ? (c.cart_adds - prev.cart_adds) / prev.cart_adds : 0;
          c.wow_purch = (prev && prev.purchases > 0) ? (c.purchases - prev.purchases) / prev.purchases : 0;
          c.wow_fis = (prev && prev.fis_users > 0) ? (c.fis_users - prev.fis_users) / prev.fis_users : 0;
          c.wow_total_intent = (prev && prev.total_intent > 0) ? (c.total_intent - prev.total_intent) / prev.total_intent : 0;
       });
       
       byCategory[cat].sparklineData = latest4Weeks.map(w => ({
          name: w,
          views: byCategory[cat][w].views
       }));
    });
    
    const categoryList = Object.keys(byCategory).sort((catA, catB) => {
       const latestW = latest4Weeks[latest4Weeks.length - 1];
       const aWow = byCategory[catA][latestW]?.wow_views || 0;
       const bWow = byCategory[catB][latestW]?.wow_views || 0;
       return aWow - bWow;
    });
    return { latest4Weeks, categories: categoryList, map: byCategory };
  }, [data, weeks, selectedPlatform]);

  
  // Totals calculations
  const tabularTotals = useMemo(() => {
    let t = { views: 0, cart_adds: 0, purchases: 0, fis_users: 0 };
    filteredData.forEach(d => {
      t.views += d.views || 0;
      t.cart_adds += d.cart_adds || 0;
      t.purchases += d.purchases || 0;
      t.fis_users += d.fis_users || 0;
    });
    t.pdp_to_cart_rate = t.views > 0 ? t.cart_adds / t.views : 0;
    t.overall_conv_rate = t.views > 0 ? t.purchases / t.views : 0;
    t.fis_intent_rate = t.views > 0 ? t.fis_users / t.views : 0;
    return t;
  }, [filteredData]);

  const weeklyCatTotals = useMemo(() => {
    let t = { views: 0, cart_adds: 0, purchases: 0, fis_users: 0 };
    weeklyCategoryData.forEach(c => {
      t.views += c.views || 0;
      t.cart_adds += c.cart_adds || 0;
      t.purchases += c.purchases || 0;
      t.fis_users += c.fis_users || 0;
    });
    t.pdp_to_cart_rate = t.views > 0 ? t.cart_adds / t.views : 0;
    t.overall_conv_rate = t.views > 0 ? t.purchases / t.views : 0;
    t.fis_intent_rate = t.views > 0 ? t.fis_users / t.views : 0;
    t.overall_intent_rate = t.views > 0 ? (t.cart_adds + t.fis_users) / t.views : 0;
    return t;
  }, [weeklyCategoryData]);

  const compTotals = useMemo(() => {
    let a = { views: 0, cart_adds: 0, purchases: 0, fis_users: 0 };
    let b = { views: 0, cart_adds: 0, purchases: 0, fis_users: 0 };
    categoryComparisonData.forEach(c => {
      a.views += c.viewsA || 0; a.cart_adds += c.cartAddsA || 0; a.purchases += c.purchasesA || 0; a.fis_users += c.fisUsersA || 0;
      b.views += c.viewsB || 0; b.cart_adds += c.cartAddsB || 0; b.purchases += c.purchasesB || 0; b.fis_users += c.fisUsersB || 0;
    });
    const aPdp = a.views > 0 ? a.cart_adds / a.views : 0; const aConv = a.views > 0 ? a.purchases / a.views : 0;
    const bPdp = b.views > 0 ? b.cart_adds / b.views : 0; const bConv = b.views > 0 ? b.purchases / b.views : 0;
    
    return {
       viewsPct: a.views > 0 ? (b.views - a.views)/a.views : 0,
       cartAddsPct: a.cart_adds > 0 ? (b.cart_adds - a.cart_adds)/a.cart_adds : 0,
       purchasesPct: a.purchases > 0 ? (b.purchases - a.purchases)/a.purchases : 0,
       fisUsersPct: a.fis_users > 0 ? (b.fis_users - a.fis_users)/a.fis_users : 0,
       pdpToCartDiff: bPdp - aPdp,
       convRateDiff: bConv - aConv
    };
  }, [categoryComparisonData]);

  const trendMatrixTotals = useMemo(() => {
    if(!trendMatrixData.latest4Weeks || trendMatrixData.latest4Weeks.length === 0) return { map: {}, sparklineData: [] };
    const latest5Weeks = weeks.slice(-5);
    const tMapAll = {};
    latest5Weeks.forEach(w => { tMapAll[w] = { views:0, cart_adds:0, purchases:0, fis_users:0, total_intent:0 }; });
    
    trendMatrixData.categories.forEach(cat => {
       latest5Weeks.forEach(w => {
          const c = trendMatrixData.map[cat] && trendMatrixData.map[cat][w];
          if(c) {
             tMapAll[w].views += c.views||0; tMapAll[w].cart_adds += c.cart_adds||0; 
             tMapAll[w].purchases += c.purchases||0; tMapAll[w].fis_users += c.fis_users||0;
             tMapAll[w].total_intent += c.total_intent||0;
          }
       });
    });
    
    trendMatrixData.latest4Weeks.forEach(w => {
       const curr = tMapAll[w];
       const prevW = latest5Weeks[latest5Weeks.indexOf(w)-1];
       const prev = prevW ? tMapAll[prevW] : null;
       curr.wow_views = (prev && prev.views>0) ? (curr.views - prev.views)/prev.views : 0;
       curr.wow_cart = (prev && prev.cart_adds>0) ? (curr.cart_adds - prev.cart_adds)/prev.cart_adds : 0;
       curr.wow_purch = (prev && prev.purchases>0) ? (curr.purchases - prev.purchases)/prev.purchases : 0;
       curr.wow_fis = (prev && prev.fis_users>0) ? (curr.fis_users - prev.fis_users)/prev.fis_users : 0;
       curr.wow_total_intent = (prev && prev.total_intent>0) ? (curr.total_intent - prev.total_intent)/prev.total_intent : 0;
    });
    
    const sparklineData = trendMatrixData.latest4Weeks.map(w => ({ name: w, views: tMapAll[w].views }));
    return { map: tMapAll, sparklineData };
  }, [trendMatrixData, weeks]);

  const toggleExpand = (category) => {
    if (expandedCategories.includes(category)) {
      setExpandedCategories(expandedCategories.filter(c => c !== category));
    } else {
      setExpandedCategories([...expandedCategories, category]);
    }
  };

  const toggleMatrixExpand = (category) => {
    if (expandedMatrixCategories.includes(category)) {
      setExpandedMatrixCategories(expandedMatrixCategories.filter(c => c !== category));
    } else {
      setExpandedMatrixCategories([...expandedMatrixCategories, category]);
    }
  };

  const metricOptions = [
    { value: 'views', label: 'Views' },
    { value: 'cart_adds', label: 'Cart Adds' },
    { value: 'purchases', label: 'Purchases' },
    { value: 'fis_users', label: 'FIS Users' }
  ];

  const formatPrimaryMetric = (val) => {
    return Number(val).toLocaleString();
  };

  const renderWowBadge = (pctValue) => {
    if (pctValue === 0) return <span style={{ color: '#888' }}>0%</span>;
    const isPositive = pctValue > 0;
    const className = `wow-badge ${isPositive ? 'positive' : 'negative'}`;
    return <span className={className}>{isPositive ? '+' : ''}{(pctValue * 100).toFixed(1)}%</span>;
  };

  const renderWowDelta = (diffValue, suffix = '') => {
    if (diffValue === 0) return <span style={{ color: '#888' }}>0{suffix}</span>;
    const isPositive = diffValue > 0;
    const color = isPositive ? '#10b981' : '#ef4444';
    return <span style={{ color, fontWeight: 'bold' }}>{isPositive ? '+' : ''}{(diffValue * (suffix === '%' ? 100 : 1)).toFixed(3)}{suffix}</span>;
  };

  const getWeekLabel = (dateStr) => weekMap[dateStr] || dateStr;

  return (
    <div className="weekly-trends-container trends-container">
      <div className="weekly-header trends-header" style={{ marginBottom: '1rem' }}>
        <h2>Weekly Analytics Dashboard</h2>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <label className="filter-label">
            <span>Category:</span>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="weekly-select trends-select"
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="filter-label">
            <span>Platform:</span>
            <select 
              value={selectedPlatform} 
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="weekly-select trends-select"
            >
              <option value="combined">Combined</option>
              <option value="web">Web</option>
              <option value="app">App</option>
            </select>
          </label>
          <label className="filter-label">
            <span>Primary Metric (Bar Chart):</span>
            <select 
              value={primaryMetric} 
              onChange={(e) => setPrimaryMetric(e.target.value)}
              className="weekly-select trends-select"
            >
              {metricOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
        </div>
      </div>
      
      {loading ? (
        <div className="weekly-loading">Loading Weekly Data...</div>
      ) : (
        <>
          {/* Top Section: Overview Charts (Bar + Line) */}
          <div className="weekly-comparison-module" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div className="chart-card" style={{ padding: '1rem', background: '#252934', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 1rem 0' }}>Latest 4 Weeks Comparison ({metricOptions.find(m => m.value === primaryMetric)?.label})</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={latest4Data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                    <XAxis dataKey="week_label" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={formatPrimaryMetric} />
                    <Tooltip cursor={{ fill: '#374151', opacity: 0.4 }} contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                    <Bar dataKey={primaryMetric} radius={[4, 4, 0, 0]}>
                      {latest4Data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === latest4Data.length - 1 ? '#5a55d2' : '#818cf8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card" style={{ padding: '1rem', background: '#252934', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 1rem 0' }}>Key Metrics Trend (%) - All Weeks</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={filteredData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                    <XAxis dataKey="week_label" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
                    <YAxis stroke="#888" tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} formatter={(value, name) => [`${value.toFixed(2)}%`, name]} />
                    <Legend />
                    <Line type="monotone" name="PDP to Cart" dataKey="pdp_to_cart_pct" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" name="Purchase %" dataKey="purchase_pct" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" name="FIS Intent" dataKey="fis_intent_pct" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="table-card" style={{ padding: '1.5rem', background: '#252934', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 1rem 0' }}>Tabular Data (Selected Category: {selectedCategory})</h3>
              <div className="table-section" style={{ overflowX: 'auto' }}>
                <table className="weekly-table trends-table" style={{ minWidth: '800px', width: '100%' }}>
                  <thead>
                    <tr>
                      <th>WEEK</th>
                      <th>VIEWS</th>
                      <th>WOW (Views)</th>
                      <th>CART ADDS</th>
                      <th>PURCHASES</th>
                      <th>FIS USERS</th>
                      <th>PDP TO CART</th>
                      <th>PURCHASE %</th>
                      <th>FIS INTENT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row, idx) => (
                      <tr key={idx}>
                        <td className="week-col">{row.week_label}</td>
                        <td className="metric-col font-medium">{Number(row.views).toLocaleString()}</td>
                        <td className="wow-col">
                          {row.wow !== null ? renderWowBadge(row.wow / 100) : <span className="wow-dash">—</span>}
                        </td>
                        <td className="metric-col">{Number(row.cart_adds).toLocaleString()}</td>
                        <td className="metric-col">{Number(row.purchases).toLocaleString()}</td>
                        <td className="metric-col">{Number(row.fis_users).toLocaleString()}</td>
                        <td className="metric-col">{formatPercent(row.pdp_to_cart_rate)}</td>
                        <td className="metric-col">{formatPercent3(row.overall_conv_rate)}</td>
                        <td className="metric-col">{formatPercent3(row.fis_intent_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#1f2937', fontWeight: 'bold' }}>
                      <td className="week-col" style={{ color: '#e5e7eb' }}>TOTAL</td>
                      <td className="metric-col">{Number(tabularTotals.views).toLocaleString()}</td>
                      <td className="wow-col"></td>
                      <td className="metric-col">{Number(tabularTotals.cart_adds).toLocaleString()}</td>
                      <td className="metric-col">{Number(tabularTotals.purchases).toLocaleString()}</td>
                      <td className="metric-col">{Number(tabularTotals.fis_users).toLocaleString()}</td>
                      <td className="metric-col">{formatPercent(tabularTotals.pdp_to_cart_rate)}</td>
                      <td className="metric-col">{formatPercent3(tabularTotals.overall_conv_rate)}</td>
                      <td className="metric-col">{formatPercent3(tabularTotals.fis_intent_rate)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Middle Section: Weekly Category Performance */}
          <div className="table-card" style={{ marginTop: '2rem', padding: '1.5rem', background: '#252934', borderRadius: '8px' }}>
            <div className="trends-header" style={{ marginBottom: '1rem', marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>Weekly Category Performance (Aggregate)</h3>
                <button 
                  onClick={() => exportToCSV(weeklyCategoryData, categoryColumns, 'weekly_category_performance.csv')}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px' }}
                >
                  Download CSV
                </button>
              </div>
              <div className="trends-filters" style={{ display: 'flex', gap: '1rem' }}>
                <label>
                  <span>Start Week:</span>
                  <select value={activeStartWeek} onChange={(e) => setActiveStartWeek(e.target.value)} className="trends-select">
                    {weeks.map(w => <option key={w} value={w}>{getWeekLabel(w)}</option>)}
                  </select>
                </label>
                <label>
                  <span>End Week:</span>
                  <select value={activeEndWeek} onChange={(e) => setActiveEndWeek(e.target.value)} className="trends-select">
                    {weeks.map(w => <option key={w} value={w}>{getWeekLabel(w)}</option>)}
                  </select>
                </label>
              </div>
            </div>
            
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="trends-table sortable-table" style={{ width: '100%', minWidth: '800px' }}>
                <thead>
                  <tr>
                    <th>Category</th>
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
                  {weeklyCategoryData.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ color: '#3b82f6', fontWeight: '500' }}>{row.category}</td>
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
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#1f2937', fontWeight: 'bold' }}>
                    <td style={{ color: '#e5e7eb' }}>TOTAL</td>
                    <td>{Number(weeklyCatTotals.views).toLocaleString()}</td>
                    <td>{Number(weeklyCatTotals.cart_adds).toLocaleString()}</td>
                    <td>{Number(weeklyCatTotals.purchases).toLocaleString()}</td>
                    <td>{Number(weeklyCatTotals.fis_users).toLocaleString()}</td>
                    <td>{formatPercent(weeklyCatTotals.pdp_to_cart_rate)}</td>
                    <td>{formatPercent3(weeklyCatTotals.overall_conv_rate)}</td>
                    <td>{formatPercent3(weeklyCatTotals.fis_intent_rate)}</td>
                    <td>{formatPercent(weeklyCatTotals.overall_intent_rate)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Original Section: Week-over-Week Category Comparison */}
          <div className="table-card" style={{ marginTop: '2rem', padding: '1.5rem', background: '#252934', borderRadius: '8px' }}>
            <div className="trends-header" style={{ marginBottom: '1rem', marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>Week-over-Week Category Comparison</h3>
              </div>
              <div className="trends-filters" style={{ display: 'flex', gap: '1rem' }}>
                <label>
                  <span>Week A (Base):</span>
                  <select value={compareWeekA} onChange={(e) => setCompareWeekA(e.target.value)} className="trends-select">
                    {weeks.map(w => <option key={w} value={w}>{getWeekLabel(w)}</option>)}
                  </select>
                </label>
                <label>
                  <span>Week B (Compare):</span>
                  <select value={compareWeekB} onChange={(e) => setCompareWeekB(e.target.value)} className="trends-select">
                    {weeks.map(w => <option key={w} value={w}>{getWeekLabel(w)}</option>)}
                  </select>
                </label>
              </div>
            </div>
            
            <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem' }}>Click on any category row to expand and see the raw numbers (Week A → Week B).</p>
            
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="trends-table sortable-table" style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1f2937' }}>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Category</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Views WoW</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Cart Adds WoW</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Purchases WoW</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>FIS Users WoW</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>PDP to Cart Diff</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Purchase % Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryComparisonData.length === 0 ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No data to compare.</td></tr>
                  ) : (
                    categoryComparisonData.map(row => {
                      const isExpanded = expandedCategories.includes(row.category);
                      return (
                        <React.Fragment key={row.category}>
                          <tr 
                            onClick={() => toggleExpand(row.category)} 
                            style={{ 
                              cursor: 'pointer', 
                              backgroundColor: isExpanded ? '#2a2f3a' : 'transparent',
                              borderBottom: isExpanded ? 'none' : '1px solid #374151',
                              transition: 'background-color 0.2s'
                            }}
                            className="clickable-row hover-bg"
                          >
                            <td style={{ padding: '12px', fontWeight: '500', color: '#e5e7eb' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {isExpanded ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                                {row.category}
                              </div>
                            </td>
                            <td style={{ padding: '12px' }}>{renderWowBadge(row.viewsPct)}</td>
                            <td style={{ padding: '12px' }}>{renderWowBadge(row.cartAddsPct)}</td>
                            <td style={{ padding: '12px' }}>{renderWowBadge(row.purchasesPct)}</td>
                            <td style={{ padding: '12px' }}>{renderWowBadge(row.fisUsersPct)}</td>
                            <td style={{ padding: '12px' }}>{renderWowDelta(row.pdpToCartDiff, '%')}</td>
                            <td style={{ padding: '12px' }}>{renderWowDelta(row.convRateDiff, '%')}</td>
                          </tr>
                          
                          {isExpanded && (
                            <tr style={{ backgroundColor: '#20242d', borderBottom: '1px solid #374151' }}>
                              <td colSpan={7} style={{ padding: '1rem 2rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', background: '#1a1d24', padding: '1rem', borderRadius: '8px' }}>
                                  
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px' }}>Views</span>
                                    <span style={{ color: '#e5e7eb' }}>{row.viewsA.toLocaleString()} <span style={{ color: '#6b7280', margin: '0 4px' }}>→</span> {row.viewsB.toLocaleString()}</span>
                                  </div>
                                  
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px' }}>Cart Adds</span>
                                    <span style={{ color: '#e5e7eb' }}>{row.cartAddsA.toLocaleString()} <span style={{ color: '#6b7280', margin: '0 4px' }}>→</span> {row.cartAddsB.toLocaleString()}</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px' }}>Purchases</span>
                                    <span style={{ color: '#e5e7eb' }}>{row.purchasesA.toLocaleString()} <span style={{ color: '#6b7280', margin: '0 4px' }}>→</span> {row.purchasesB.toLocaleString()}</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px' }}>FIS Users</span>
                                    <span style={{ color: '#e5e7eb' }}>{row.fisUsersA.toLocaleString()} <span style={{ color: '#6b7280', margin: '0 4px' }}>→</span> {row.fisUsersB.toLocaleString()}</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px' }}>PDP to Cart</span>
                                    <span style={{ color: '#e5e7eb' }}>{(row.pdpToCartA * 100).toFixed(2)}% <span style={{ color: '#6b7280', margin: '0 4px' }}>→</span> {(row.pdpToCartB * 100).toFixed(2)}%</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px' }}>Purchase %</span>
                                    <span style={{ color: '#e5e7eb' }}>{(row.convRateA * 100).toFixed(3)}% <span style={{ color: '#6b7280', margin: '0 4px' }}>→</span> {(row.convRateB * 100).toFixed(3)}%</span>
                                  </div>
                                  
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#1f2937', borderTop: '2px solid #374151' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#e5e7eb' }}>TOTAL</td>
                    <td style={{ padding: '12px' }}>{renderWowBadge(compTotals.viewsPct)}</td>
                    <td style={{ padding: '12px' }}>{renderWowBadge(compTotals.cartAddsPct)}</td>
                    <td style={{ padding: '12px' }}>{renderWowBadge(compTotals.purchasesPct)}</td>
                    <td style={{ padding: '12px' }}>{renderWowBadge(compTotals.fisUsersPct)}</td>
                    <td style={{ padding: '12px' }}>{renderWowDelta(compTotals.pdpToCartDiff, '%')}</td>
                    <td style={{ padding: '12px' }}>{renderWowDelta(compTotals.convRateDiff, '%')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* New Section: 4-Week Trend Matrix (MOVED TO BOTTOM) */}
          <div className="table-card" style={{ marginTop: '2rem', padding: '1.5rem', background: '#252934', borderRadius: '8px' }}>
            <div className="trends-header" style={{ marginBottom: '1rem', marginTop: 0 }}>
              <h3 style={{ margin: 0 }}>4-Week Category Trend Matrix (Week-over-Week Growth)</h3>
            </div>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Shows week-on-week growth metrics (grown or de-grown). Click on any category to view the raw numbers.
            </p>
            
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="trends-table sortable-table" style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1f2937' }}>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Category</th>
                    <th style={{ padding: '12px', textAlign: 'center', width: '100px' }}>Trend (Views)</th>
                    {trendMatrixData.latest4Weeks.map(w => (
                      <th key={w} style={{ padding: '12px', textAlign: 'left', minWidth: '180px' }}>{getWeekLabel(w)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trendMatrixData.categories.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No data available.</td></tr>
                  ) : (
                    trendMatrixData.categories.map(cat => {
                      const isExpanded = expandedMatrixCategories.includes(cat);
                      return (
                        <React.Fragment key={cat}>
                          <tr 
                            onClick={() => toggleMatrixExpand(cat)}
                            className="clickable-row hover-bg"
                            style={{ 
                              cursor: 'pointer', 
                              backgroundColor: isExpanded ? '#2a2f3a' : 'transparent',
                              borderBottom: isExpanded ? 'none' : '1px solid #374151'
                            }}
                          >
                            <td style={{ padding: '12px', fontWeight: '500', color: '#e5e7eb', width: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {isExpanded ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                                {cat}
                              </div>
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              <LineChart width={80} height={35} data={trendMatrixData.map[cat].sparklineData}>
                                <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                                <YAxis domain={['dataMin', 'dataMax']} hide />
                              </LineChart>
                            </td>
                            {trendMatrixData.latest4Weeks.map(w => {
                              const cell = trendMatrixData.map[cat][w];
                              return (
                                <td key={w} style={{ padding: '12px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#9ca3af' }}>Views:</span> 
                                      {renderWowBadge(cell.wow_views)}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#9ca3af' }}>Cart Adds:</span> 
                                      {renderWowBadge(cell.wow_cart)}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#9ca3af' }}>Purch:</span> 
                                      {renderWowBadge(cell.wow_purch)}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#9ca3af' }}>FIS:</span> 
                                      {renderWowBadge(cell.wow_fis)}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#9ca3af' }}>Total Intent:</span> 
                                      {renderWowBadge(cell.wow_total_intent)}
                                    </div>
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                          {isExpanded && (
                            <tr style={{ backgroundColor: '#20242d', borderBottom: '1px solid #374151' }}>
                              <td colSpan={6} style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                  {trendMatrixData.latest4Weeks.map(w => {
                                    const cell = trendMatrixData.map[cat][w];
                                    return (
                                      <div key={`exp-${w}`} style={{ background: '#1a1d24', padding: '1.2rem', borderRadius: '8px', border: '1px solid #374151' }}>
                                        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#60a5fa', borderBottom: '1px solid #374151', paddingBottom: '8px' }}>
                                          {getWeekLabel(w)}
                                        </h4>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                                          <span style={{ color: '#9ca3af' }}>Views</span><span style={{color: '#e5e7eb'}}>{cell.views.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                                          <span style={{ color: '#9ca3af' }}>Cart Adds</span><span style={{color: '#e5e7eb'}}>{cell.cart_adds.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                                          <span style={{ color: '#9ca3af' }}>Purchases</span><span style={{color: '#e5e7eb'}}>{cell.purchases.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span style={{ color: '#9ca3af' }}>FIS Users</span><span style={{color: '#e5e7eb'}}>{cell.fis_users.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span style={{ color: '#9ca3af' }}>Total Intent</span><span style={{color: '#e5e7eb'}}>{(cell.cart_adds + cell.fis_users).toLocaleString()}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#1f2937', borderTop: '2px solid #374151' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#e5e7eb' }}>TOTAL</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {trendMatrixTotals.sparklineData.length > 0 && (
                        <LineChart width={80} height={35} data={trendMatrixTotals.sparklineData}>
                          <Line type="monotone" dataKey="views" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                          <YAxis domain={['dataMin', 'dataMax']} hide />
                        </LineChart>
                      )}
                    </td>
                    {trendMatrixData.latest4Weeks.map(w => {
                      const cell = trendMatrixTotals.map[w];
                      if (!cell) return <td key={w}></td>;
                      return (
                        <td key={w} style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#e5e7eb' }}>Views:</span> 
                              {renderWowBadge(cell.wow_views)}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#e5e7eb' }}>Cart Adds:</span> 
                              {renderWowBadge(cell.wow_cart)}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#e5e7eb' }}>Purch:</span> 
                              {renderWowBadge(cell.wow_purch)}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#e5e7eb' }}>FIS:</span> 
                              {renderWowBadge(cell.wow_fis)}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#e5e7eb' }}>Total Intent:</span> 
                              {renderWowBadge(cell.wow_total_intent)}
                            </div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

        </>
      )}
    </div>
  );
};
