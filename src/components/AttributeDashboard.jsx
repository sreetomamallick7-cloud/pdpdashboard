import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatPercent, formatPercent3 } from '../utils/formatters';
import { exportToCSV } from '../utils/exportUtils';

const getAttributeColumns = (attributeName) => [
    { header: attributeName, accessor: 'attributeValue' },
    { header: 'Views', accessor: 'views' },
    { header: 'Cart Adds', accessor: 'cart_adds' },
    { header: 'FIS Users', accessor: 'fis_users' },
    { header: 'PDP to Cart', accessor: row => formatPercent(row.pdp_to_cart_rate) },
    { header: 'FIS Intent', accessor: row => formatPercent3(row.fis_intent_rate) },
    { header: 'Total Intent', accessor: row => formatPercent(row.overall_intent_rate) }
];

export const AttributeDashboard = () => {
    const [loadingFilters, setLoadingFilters] = useState(true);
    const [loadingData, setLoadingData] = useState(false);
    const [error, setError] = useState(null);

    const [months, setMonths] = useState(['Overall']);
    const [categories, setCategories] = useState(['All']);
    const [attributeKeys, setAttributeKeys] = useState([]);

    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedAttribute, setSelectedAttribute] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState('combined');
    const [selectedMonth, setSelectedMonth] = useState('Overall');

    const [analysisData, setAnalysisData] = useState(null);

    // 1. Fetch Filters Once on Mount
    useEffect(() => {
        const fetchFilters = async () => {
            setLoadingFilters(true);
            try {
                const { data, error } = await supabase.rpc('get_dashboard_filters');
                if (error) throw error;
                
                if (data) {
                    setMonths(['Overall', ...(data.months || [])]);
                    setCategories(['All', ...(data.categories || [])]);
                    const attrs = (data.attributes || []).sort();
                    setAttributeKeys(attrs);
                    if (attrs.length > 0) setSelectedAttribute(attrs[0]);
                }
            } catch (err) {
                console.error('Error fetching filters:', err);
                setError(`Failed to fetch filters. Error: ${err.message || JSON.stringify(err)}`);
            } finally {
                setLoadingFilters(false);
            }
        };

        fetchFilters();
    }, []);

    // 2. Fetch Data whenever filters change
    useEffect(() => {
        if (!selectedAttribute || loadingFilters) return;

        const fetchData = async () => {
            setLoadingData(true);
            setError(null);
            try {
                const { data, error } = await supabase.rpc('get_attribute_breakdown', {
                    p_month: selectedMonth,
                    p_category: selectedCategory,
                    p_platform: selectedPlatform,
                    p_attribute_key: selectedAttribute
                });

                if (error) throw error;

                if (data) {
                    // Calculate coverage dynamically on the frontend based on the returned stats
                    const matchStats = data.matchStats || { Exact: 0, Prefix: 0, Fuzzy: 0, Unmatched: 0, TotalViews: 0 };
                    const total = matchStats.TotalViews;
                    
                    const coverage = {
                        Exact: total > 0 ? matchStats.Exact / total : 0,
                        Prefix: total > 0 ? matchStats.Prefix / total : 0,
                        Fuzzy: total > 0 ? matchStats.Fuzzy / total : 0,
                        Unmatched: total > 0 ? matchStats.Unmatched / total : 0,
                    };

                    setAnalysisData({
                        tableData: data.tableData || [],
                        matchStats,
                        coverage
                    });
                }
            } catch (err) {
                console.error('Error fetching breakdown data:', err);
                setError('Failed to load attribute breakdown. Please ensure you ran the Supabase RPC SQL script.');
            } finally {
                setLoadingData(false);
            }
        };

        fetchData();
    }, [selectedMonth, selectedCategory, selectedPlatform, selectedAttribute, loadingFilters]);

    if (loadingFilters) return <div className="trends-loading"><div className="spinner"></div> Initializing Dashboard...</div>;
    if (error) return <div className="trends-error">{error}</div>;

    return (
        <div className="attribute-dashboard">
            <div className="trends-filters" style={{ marginBottom: '2rem', padding: '1rem', background: '#1a1a1a', borderRadius: '8px', flexWrap: 'wrap' }}>
                <label>
                    <span>Month:</span>
                    <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="trends-select">
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </label>
                <label>
                    <span>Category:</span>
                    <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="trends-select">
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </label>
                <label>
                    <span>Attribute:</span>
                    <select value={selectedAttribute} onChange={e => setSelectedAttribute(e.target.value)} className="trends-select">
                        {attributeKeys.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                </label>
                <label>
                    <span>Platform:</span>
                    <select value={selectedPlatform} onChange={e => setSelectedPlatform(e.target.value)} className="trends-select">
                        <option value="combined">Combined</option>
                        <option value="web">Web</option>
                        <option value="app">App</option>
                    </select>
                </label>
            </div>

            {loadingData ? (
                 <div className="trends-loading"><div className="spinner"></div> Loading Attribute Data...</div>
            ) : !analysisData || analysisData.tableData.length === 0 ? (
                <div className="no-data">No data available for the selected filters.</div>
            ) : (
                <>
                    <div className="coverage-banner" style={{ display: 'flex', gap: '2rem', padding: '1rem', background: '#1a1a1a', borderRadius: '8px', marginBottom: '2rem', flexWrap: 'wrap' }}>
                        <div><strong>Match Coverage (by Views)</strong></div>
                        <div style={{color: '#10b981'}}>Exact: {formatPercent(analysisData.coverage.Exact)}</div>
                        <div style={{color: '#3b82f6'}}>Prefix: {formatPercent(analysisData.coverage.Prefix)}</div>
                        <div style={{color: '#f59e0b'}}>Fuzzy: {formatPercent(analysisData.coverage.Fuzzy)}</div>
                        <div style={{color: '#ef4444'}}>Unmatched: {formatPercent(analysisData.coverage.Unmatched)}</div>
                        
                        {analysisData.coverage.Fuzzy > 0.4 && (
                            <div style={{color: '#f59e0b', fontStyle: 'italic', marginLeft: 'auto'}}>
                                ⚠️ High reliance on fuzzy matches
                            </div>
                        )}
                        {analysisData.coverage.Unmatched > 0.3 && (
                            <div style={{color: '#ef4444', fontStyle: 'italic', marginLeft: 'auto'}}>
                                ⚠️ Low match coverage
                            </div>
                        )}
                    </div>

                    <div className="chart-card">
                        <h3>{selectedAttribute} Performance</h3>
                        <div className="chart-wrapper">
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={analysisData.tableData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="attributeValue" stroke="#888" />
                                    <YAxis stroke="#888" tickFormatter={(v) => `${v}%`} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                        formatter={(value) => `${value.toFixed(2)}%`}
                                    />
                                    <Legend />
                                    <Bar name="PDP to Cart %" dataKey="pdp_to_cart_pct" fill="#3b82f6" />
                                    <Bar name="FIS Intent %" dataKey="fis_intent_pct" fill="#f59e0b" />
                                    <Bar name="Total Intent %" dataKey="overall_intent_pct" fill="#10b981" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="table-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0 }}>Detailed Breakdown</h3>
                            <button 
                                onClick={() => exportToCSV(analysisData.tableData, getAttributeColumns(selectedAttribute), `attribute_breakdown_${selectedAttribute}.csv`)}
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px' }}
                            >
                                Download CSV
                            </button>
                        </div>
                        <div className="table-wrapper">
                            <table className="trends-table">
                                <thead>
                                    <tr>
                                        <th>{selectedAttribute}</th>
                                        <th>Views</th>
                                        <th>Cart Adds</th>
                                        <th>FIS Users</th>
                                        <th>PDP to Cart</th>
                                        <th>FIS Intent</th>
                                        <th>Total Intent</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysisData.tableData.map((row, idx) => (
                                        <tr key={idx}>
                                            <td>{row.attributeValue}</td>
                                            <td>{row.views?.toLocaleString()}</td>
                                            <td>{row.cart_adds?.toLocaleString()}</td>
                                            <td>{row.fis_users?.toLocaleString()}</td>
                                            <td>{formatPercent(row.pdp_to_cart_rate)}</td>
                                            <td>{formatPercent3(row.fis_intent_rate)}</td>
                                            <td>{formatPercent(row.overall_intent_rate)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
