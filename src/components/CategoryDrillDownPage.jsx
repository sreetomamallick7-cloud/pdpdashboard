import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabaseClient';
import { formatPercent } from '../utils/formatters';
import { exportToCSV } from '../utils/exportUtils';
import './CategoryDrillDownPage.css';

export const CategoryDrillDownPage = () => {
  const { categoryName } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const category = categoryName ? decodeURIComponent(categoryName) : '';
  const platform = searchParams.get('platform') || 'combined';
  const startDate = searchParams.get('start') || '';
  const endDate = searchParams.get('end') || '';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [threshold, setThreshold] = useState(50);
  const [activeLayer2, setActiveLayer2] = useState(null);

  // Sorting states for different tables
  const [sortConfigL2, setSortConfigL2] = useState({ key: 'views', direction: 'desc' });
  const [sortConfigUnderexposedCart, setSortConfigUnderexposedCart] = useState({ key: 'opp_score_cart', direction: 'desc' });
  const [sortConfigUnderexposedFis, setSortConfigUnderexposedFis] = useState({ key: 'opp_score_fis', direction: 'desc' });
  const [sortConfigWastedFis, setSortConfigWastedFis] = useState({ key: 'opp_score_fis', direction: 'asc' });

  const getSortIndicator = (config, key) => {
    if (config.key !== key) return null;
    return config.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const handleSort = (config, setConfig, key) => {
    let direction = 'desc';
    if (config.key === key && config.direction === 'desc') {
      direction = 'asc';
    }
    setConfig({ key, direction });
  };
  
  const applySort = (arr, config) => {
    return [...arr].sort((a, b) => {
      const aVal = a[config.key] ?? 0;
      const bVal = b[config.key] ?? 0;
      if (aVal < bVal) return config.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };
  
  // Layer 2 visibility state (if clicking a group reveals the whole list, or we just expand inline)
  // For simplicity, we can show a summary at the top, and the tables below are the identity reveals.
  
  useEffect(() => {
    if (!category) return;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: drilldownData, error: dbError } = await supabase.rpc('get_category_drilldown', {
          p_category: category,
          p_platform: platform,
          p_start_date: startDate,
          p_end_date: endDate
        });
        
        if (dbError) throw dbError;
        
        const enhancedData = (drilldownData || []).map(row => ({
          ...row,
          total_intent: row.views > 0 ? (row.cart_adds + row.fis_users) / row.views : 0
        }));
        
        setData(enhancedData);
      } catch (err) {
        console.error("Error fetching drilldown data:", err);
        setError("Failed to load category drill-down data. Make sure you've run the SQL migration in Supabase.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [category, platform, startDate, endDate]);

  const concentrationSummary = useMemo(() => {
    if (!data.length) return null;
    
    const calcConcentration = (metric) => {
      const sorted = [...data].sort((a, b) => b[metric] - a[metric]);
      const total = sorted.reduce((sum, row) => sum + row[metric], 0);
      if (total === 0) return { count: 0, totalSkus: sorted.length, share: 0 };
      
      let runningSum = 0;
      let count = 0;
      const target = total * (threshold / 100);
      
      const skus = [];
      for (const row of sorted) {
        runningSum += row[metric];
        count++;
        skus.push(row);
        if (runningSum >= target) break;
      }
      
      return { 
        count, 
        totalSkus: sorted.length, 
        share: (runningSum / total) * 100,
        skus
      };
    };

    return {
      views: calcConcentration('views'),
      cart: calcConcentration('cart_adds'),
      fis: calcConcentration('fis_users')
    };
  }, [data, threshold]);

  const anomalies = useMemo(() => data.filter(d => d.is_zero_view_anomaly), [data]);
  
  const underexposedCart = useMemo(() => {
    return data.filter(d => d.opp_score_cart && d.opp_score_cart > 0)
               // Sorting is applied dynamically at render time to allow table column clicks
               ;
  }, [data]);

  const underexposedFis = useMemo(() => {
    return data.filter(d => d.opp_score_fis && d.opp_score_fis > 0)
               ;
  }, [data]);
  
  const wastedViewsFis = useMemo(() => {
    return data.filter(d => d.opp_score_fis && d.opp_score_fis < 0)
               ;
  }, [data]);

  

  
  const sortedLayer2 = useMemo(() => {
    if (!activeLayer2 || !concentrationSummary) return [];
    return applySort(concentrationSummary[activeLayer2].skus, sortConfigL2);
  }, [activeLayer2, concentrationSummary, sortConfigL2]);

  const sortedUnderexposedCart = useMemo(() => applySort(underexposedCart, sortConfigUnderexposedCart).slice(0, 50), [underexposedCart, sortConfigUnderexposedCart]);
  const sortedUnderexposedFis = useMemo(() => applySort(underexposedFis, sortConfigUnderexposedFis).slice(0, 50), [underexposedFis, sortConfigUnderexposedFis]);
  const sortedWastedViewsFis = useMemo(() => applySort(wastedViewsFis, sortConfigWastedFis).slice(0, 50), [wastedViewsFis, sortConfigWastedFis]);

  return (
    <div className="drilldown-page-container">
      <div className="drilldown-page-content">
        <div className="drilldown-page-header">
          <h2>Category Drill-Down: {category}</h2>
          <button className="back-button" onClick={() => navigate(-1)} style={{ padding: '0.4rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Back to Trends</button>
        </div>
        
        <div className="drilldown-page-body">
          <div className="drilldown-filters">
            <p><strong>Platform:</strong> {platform === 'combined' ? 'Combined' : platform}</p>
            <p><strong>Period:</strong> {startDate} to {endDate}</p>
            <div className="threshold-selector">
              <label>
                Concentration Threshold: <strong>{threshold}%</strong>
                <input 
                  type="range" 
                  min="10" 
                  max="90" 
                  step="5" 
                  value={threshold} 
                  onChange={(e) => setThreshold(Number(e.target.value))} 
                />
              </label>
            </div>
          </div>

          {loading && <div className="loading-spinner">Loading SKU data...</div>}
          {error && <div className="error-message">{error}</div>}
          
          {!loading && !error && data.length === 0 && (
            <div className="no-data">No data found for this category and period.</div>
          )}

          {!loading && !error && data.length > 0 && (
            <>
              <div className="concentration-summary">
                <h3>Layer 1: Concentration Summary</h3>
                <div className="summary-cards">
                  <div className={`summary-card clickable ${activeLayer2 === 'views' ? 'active' : ''}`} onClick={() => setActiveLayer2(activeLayer2 === 'views' ? null : 'views')}>
                    <h4>Views</h4>
                    <p><strong>{concentrationSummary.views.count}</strong> of {concentrationSummary.views.totalSkus} SKUs</p>
                    <p className="subtext">({formatPercent(concentrationSummary.views.count / concentrationSummary.views.totalSkus)}) account for ~{threshold}% of views</p>
                  </div>
                  <div className={`summary-card clickable ${activeLayer2 === 'cart' ? 'active' : ''}`} onClick={() => setActiveLayer2(activeLayer2 === 'cart' ? null : 'cart')}>
                    <h4>Cart Adds</h4>
                    <p><strong>{concentrationSummary.cart.count}</strong> of {concentrationSummary.cart.totalSkus} SKUs</p>
                    <p className="subtext">({formatPercent(concentrationSummary.cart.count / concentrationSummary.cart.totalSkus)}) account for ~{threshold}% of cart adds</p>
                  </div>
                  <div className={`summary-card clickable ${activeLayer2 === 'fis' ? 'active' : ''}`} onClick={() => setActiveLayer2(activeLayer2 === 'fis' ? null : 'fis')}>
                    <h4>FIS Users</h4>
                    <p><strong>{concentrationSummary.fis.count}</strong> of {concentrationSummary.fis.totalSkus} SKUs</p>
                    <p className="subtext">({formatPercent(concentrationSummary.fis.count / concentrationSummary.fis.totalSkus)}) account for ~{threshold}% of FIS</p>
                  </div>
                </div>
              </div>

              {activeLayer2 && (
                <div className="drilldown-section layer2-drilldown">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Top {activeLayer2 === 'views' ? 'Views' : activeLayer2 === 'cart' ? 'Cart Adds' : 'FIS Users'} Contributors ({concentrationSummary[activeLayer2].skus.length} SKUs)</h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => {
                          const columns = [
                            { header: 'Product ID', accessor: row => row.base_sku || row.product_identifier },
                            { header: 'Product Name', accessor: 'product_name' },
                            { header: 'Views', accessor: 'views' },
                            { header: 'Cart Adds', accessor: 'cart_adds' },
                            { header: 'Purchases', accessor: 'purchases' },
                            { header: 'FIS Users', accessor: 'fis_users' },
                            { header: 'Total Intent', accessor: row => formatPercent(row.total_intent) }
                          ];
                          exportToCSV(sortedLayer2, columns, `layer2_${activeLayer2}_${category}.csv`);
                        }}
                        style={{ padding: '0.2rem 0.5rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px' }}
                      >
                        Download CSV
                      </button>
                      <button onClick={() => setActiveLayer2(null)} style={{ padding: '0.2rem 0.5rem', cursor: 'pointer' }}>Close</button>
                    </div>
                  </div>
                  <div className="table-wrapper">
                    <table className="trends-table">
                      <thead>
                        <tr>
                          <th onClick={() => handleSort(sortConfigL2, setSortConfigL2, 'base_sku')} style={{cursor:'pointer', userSelect:'none'}}>Product ID{getSortIndicator(sortConfigL2, 'base_sku')}</th>
                          <th onClick={() => handleSort(sortConfigL2, setSortConfigL2, 'product_name')} style={{cursor:'pointer', userSelect:'none'}}>Product Name{getSortIndicator(sortConfigL2, 'product_name')}</th>
                          <th onClick={() => handleSort(sortConfigL2, setSortConfigL2, 'views')} style={{cursor:'pointer', userSelect:'none'}}>Views{getSortIndicator(sortConfigL2, 'views')}</th>
                          <th onClick={() => handleSort(sortConfigL2, setSortConfigL2, 'cart_adds')} style={{cursor:'pointer', userSelect:'none'}}>Cart Adds{getSortIndicator(sortConfigL2, 'cart_adds')}</th>
                          <th onClick={() => handleSort(sortConfigL2, setSortConfigL2, 'purchases')} style={{cursor:'pointer', userSelect:'none'}}>Purchases{getSortIndicator(sortConfigL2, 'purchases')}</th>
                          <th onClick={() => handleSort(sortConfigL2, setSortConfigL2, 'fis_users')} style={{cursor:'pointer', userSelect:'none'}}>FIS Users{getSortIndicator(sortConfigL2, 'fis_users')}</th>
                          <th onClick={() => handleSort(sortConfigL2, setSortConfigL2, 'total_intent')} style={{cursor:'pointer', userSelect:'none'}}>Total Intent{getSortIndicator(sortConfigL2, 'total_intent')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLayer2.map(row => (
                          <tr key={row.product_identifier}>
                            <td>{row.base_sku || row.product_identifier}</td>
                            <td>{row.product_name || 'Unknown'}</td>
                            <td>{row.views}</td>
                            <td>{row.cart_adds}</td>
                            <td>{row.purchases}</td>
                            <td>{row.fis_users}</td>
                            <td>{formatPercent(row.total_intent)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {anomalies.length > 0 && (
                <div className="drilldown-section anomalies">
                  <h3>Zero/Near-Zero View Anomalies</h3>
                  <p className="section-desc">SKUs where cart-adds or purchases exceed views (likely tracking/attribution gap).</p>
                  <div className="table-wrapper">
                    <table className="trends-table">
                      <thead>
                        <tr>
                          <th>Product ID</th>
                          <th>Product Name</th>
                          <th>Views</th>
                          <th>Cart Adds</th>
                          <th>Purchases</th>
                        </tr>
                      </thead>
                      <tbody>
                        {anomalies.map(row => (
                          <tr key={row.product_identifier}>
                            <td>{row.base_sku || row.product_identifier}</td>
                            <td>{row.product_name || 'Unknown'}</td>
                            <td>{row.views}</td>
                            <td>{row.cart_adds}</td>
                            <td>{row.purchases}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="drilldown-section">
                <h3>Underexposed Opportunities (Cart)</h3>
                <p className="section-desc">Converts well (high Wilson rate), barely seen. Push visibility.</p>
                <div className="table-wrapper">
                  <table className="trends-table">
                    <thead>
                      <tr>
                        <th onClick={() => handleSort(sortConfigUnderexposedCart, setSortConfigUnderexposedCart, 'base_sku')} style={{cursor:'pointer', userSelect:'none'}}>Product ID{getSortIndicator(sortConfigUnderexposedCart, 'base_sku')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedCart, setSortConfigUnderexposedCart, 'product_name')} style={{cursor:'pointer', userSelect:'none'}}>Product Name{getSortIndicator(sortConfigUnderexposedCart, 'product_name')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedCart, setSortConfigUnderexposedCart, 'views')} style={{cursor:'pointer', userSelect:'none'}}>Views{getSortIndicator(sortConfigUnderexposedCart, 'views')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedCart, setSortConfigUnderexposedCart, 'cart_adds')} style={{cursor:'pointer', userSelect:'none'}}>Cart Adds{getSortIndicator(sortConfigUnderexposedCart, 'cart_adds')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedCart, setSortConfigUnderexposedCart, 'fis_users')} style={{cursor:'pointer', userSelect:'none'}}>FIS Users{getSortIndicator(sortConfigUnderexposedCart, 'fis_users')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedCart, setSortConfigUnderexposedCart, 'wilson_cart_rate')} style={{cursor:'pointer', userSelect:'none'}}>Wilson Adj. Rate{getSortIndicator(sortConfigUnderexposedCart, 'wilson_cart_rate')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedCart, setSortConfigUnderexposedCart, 'opp_score_cart')} style={{cursor:'pointer', userSelect:'none'}}>Opp Score{getSortIndicator(sortConfigUnderexposedCart, 'opp_score_cart')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUnderexposedCart.map(row => (
                        <tr key={row.product_identifier}>
                          <td>{row.base_sku || row.product_identifier}</td>
                          <td>{row.product_name || 'Unknown'}</td>
                          <td>{row.views}</td>
                          <td>{row.cart_adds}</td>
                          <td>{row.fis_users}</td>
                          <td>{formatPercent(row.wilson_cart_rate)}</td>
                          <td style={{color: '#10b981'}}>+{formatPercent(row.opp_score_cart)}</td>
                        </tr>
                      ))}
                      {underexposedCart.length === 0 && (
                        <tr><td colSpan="7" style={{textAlign: 'center'}}>No significant opportunities found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>


              <div className="drilldown-section">
                <h3>Underexposed Opportunities (FIS)</h3>
                <p className="section-desc">High FIS conversion, barely seen. Push visibility.</p>
                <div className="table-wrapper">
                  <table className="trends-table">
                    <thead>
                      <tr>
                        <th onClick={() => handleSort(sortConfigUnderexposedFis, setSortConfigUnderexposedFis, 'base_sku')} style={{cursor:'pointer', userSelect:'none'}}>Product ID{getSortIndicator(sortConfigUnderexposedFis, 'base_sku')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedFis, setSortConfigUnderexposedFis, 'product_name')} style={{cursor:'pointer', userSelect:'none'}}>Product Name{getSortIndicator(sortConfigUnderexposedFis, 'product_name')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedFis, setSortConfigUnderexposedFis, 'views')} style={{cursor:'pointer', userSelect:'none'}}>Views{getSortIndicator(sortConfigUnderexposedFis, 'views')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedFis, setSortConfigUnderexposedFis, 'fis_users')} style={{cursor:'pointer', userSelect:'none'}}>FIS Users{getSortIndicator(sortConfigUnderexposedFis, 'fis_users')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedFis, setSortConfigUnderexposedFis, 'wilson_fis_rate')} style={{cursor:'pointer', userSelect:'none'}}>Wilson Adj. Rate{getSortIndicator(sortConfigUnderexposedFis, 'wilson_fis_rate')}</th>
                        <th onClick={() => handleSort(sortConfigUnderexposedFis, setSortConfigUnderexposedFis, 'opp_score_fis')} style={{cursor:'pointer', userSelect:'none'}}>Opp Score{getSortIndicator(sortConfigUnderexposedFis, 'opp_score_fis')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUnderexposedFis.map(row => (
                        <tr key={row.product_identifier}>
                          <td>{row.base_sku || row.product_identifier}</td>
                          <td>{row.product_name || 'Unknown'}</td>
                          <td>{row.views}</td>
                          <td>{row.fis_users}</td>
                          <td>{formatPercent(row.wilson_fis_rate)}</td>
                          <td style={{color: '#10b981'}}>+{formatPercent(row.opp_score_fis)}</td>
                        </tr>
                      ))}
                      {underexposedFis.length === 0 && (
                        <tr><td colSpan="6" style={{textAlign: 'center'}}>No significant opportunities found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="drilldown-section">
                <h3>Wasted Views (FIS)</h3>
                <p className="section-desc">Seen a lot, very low FIS engagement.</p>
                <div className="table-wrapper">
                  <table className="trends-table">
                    <thead>
                      <tr>
                        <th onClick={() => handleSort(sortConfigWastedFis, setSortConfigWastedFis, 'base_sku')} style={{cursor:'pointer', userSelect:'none'}}>Product ID{getSortIndicator(sortConfigWastedFis, 'base_sku')}</th>
                        <th onClick={() => handleSort(sortConfigWastedFis, setSortConfigWastedFis, 'product_name')} style={{cursor:'pointer', userSelect:'none'}}>Product Name{getSortIndicator(sortConfigWastedFis, 'product_name')}</th>
                        <th onClick={() => handleSort(sortConfigWastedFis, setSortConfigWastedFis, 'views')} style={{cursor:'pointer', userSelect:'none'}}>Views{getSortIndicator(sortConfigWastedFis, 'views')}</th>
                        <th onClick={() => handleSort(sortConfigWastedFis, setSortConfigWastedFis, 'fis_users')} style={{cursor:'pointer', userSelect:'none'}}>FIS Users{getSortIndicator(sortConfigWastedFis, 'fis_users')}</th>
                        <th onClick={() => handleSort(sortConfigWastedFis, setSortConfigWastedFis, 'wilson_fis_rate')} style={{cursor:'pointer', userSelect:'none'}}>Wilson Adj. Rate{getSortIndicator(sortConfigWastedFis, 'wilson_fis_rate')}</th>
                        <th onClick={() => handleSort(sortConfigWastedFis, setSortConfigWastedFis, 'opp_score_fis')} style={{cursor:'pointer', userSelect:'none'}}>Opp Score{getSortIndicator(sortConfigWastedFis, 'opp_score_fis')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedWastedViewsFis.map(row => (
                        <tr key={row.product_identifier}>
                          <td>{row.base_sku || row.product_identifier}</td>
                          <td>{row.product_name || 'Unknown'}</td>
                          <td>{row.views}</td>
                          <td>{row.fis_users}</td>
                          <td>{formatPercent(row.wilson_fis_rate)}</td>
                          <td style={{color: '#ef4444'}}>{formatPercent(row.opp_score_fis)}</td>
                        </tr>
                      ))}
                      {wastedViewsFis.length === 0 && (
                        <tr><td colSpan="6" style={{textAlign: 'center'}}>No significant wasted views found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  );
};
