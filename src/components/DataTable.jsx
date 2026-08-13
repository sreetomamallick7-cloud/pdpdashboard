import React, { useState } from 'react';
import { formatNumber, formatCurrency, formatPercent, formatPercent3, formatDelta } from '../utils/formatters';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

const MetricCell = ({ valA, valB, mode, formatter = formatNumber, type = 'number' }) => {
  if (mode === 'current') return <td className="metric-cell">{formatter(valA)}</td>;
  if (mode === 'comparison') return <td className="metric-cell">{formatter(valB)}</td>;
  
  const delta = (valA !== null && valB !== null) ? valA - valB : null;
  const deltaClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
  
  return (
    <td className="metric-cell both-mode">
      <div className="val-a">{formatter(valA)}</div>
      <div className={`delta ${deltaClass}`}>
        {formatDelta(delta, type)}
      </div>
    </td>
  );
};

export const DataTable = ({ data, periodMode, isCombined }) => {
  const [expandedCats, setExpandedCats] = useState({});
  const [search, setSearch] = useState('');

  const toggleCat = (catName) => {
    setExpandedCats(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  const { categories, products } = data.periodA || data.periodB; // We use whichever is available for the list
  
  // To handle period A and B gracefully, we need a unified list of categories and products
  // We'll build a unified map
  const unifiedCats = {};
  const unifiedProds = {};
  
  const mergeSource = (source, periodKey) => {
    if (!source) return;
    source.categories.forEach(c => {
      if (!unifiedCats[c.category]) unifiedCats[c.category] = { category: c.category, periodA: null, periodB: null };
      unifiedCats[c.category][periodKey] = c;
    });
    source.products.forEach(p => {
      if (!unifiedProds[p.normalizedName]) unifiedProds[p.normalizedName] = { 
        normalizedName: p.normalizedName, 
        productName: p.productName,
        category: p.category, 
        periodA: null, 
        periodB: null 
      };
      unifiedProds[p.normalizedName][periodKey] = p;
    });
  };
  
  mergeSource(data.periodA, 'periodA');
  mergeSource(data.periodB, 'periodB');

  const filteredCats = Object.values(unifiedCats).sort((a, b) => a.category.localeCompare(b.category));
  const filteredProds = Object.values(unifiedProds).filter(p => p.productName.toLowerCase().includes(search.toLowerCase()));

  const columns = [
    { key: 'views', label: 'Views', formatter: formatNumber, type: 'number' },
    { key: 'cartAdds', label: 'Cart Adds', formatter: formatNumber, type: 'number' },
    { key: 'purchases', label: 'Purchases', formatter: formatNumber, type: 'number' },
    { key: 'revenue', label: 'Revenue', formatter: formatCurrency, type: 'number' },
    { key: 'pdpToCartRate', label: 'PDP→Cart %', formatter: formatPercent, type: 'percent' },
    { key: 'cartToPurchaseRate', label: 'Cart→Purch %', formatter: formatPercent, type: 'percent' },
    { key: 'overallConvRate', label: 'Conv %', formatter: formatPercent3, type: 'percent3' },
    { key: 'fisUsers', label: 'FIS Users', formatter: formatNumber, type: 'number' },
    { key: 'fisIntentRate', label: 'FIS Intent %', formatter: formatPercent3, type: 'percent3' },
  ];

  return (
    <div className="data-table-container">
      <div className="table-controls">
        <input 
          type="text" 
          placeholder="Search products..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
      </div>
      
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="sticky-col">Name</th>
              {columns.map(c => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredCats.map(cat => {
              const isExpanded = expandedCats[cat.category];
              const catProds = filteredProds.filter(p => p.category === cat.category);
              
              if (search && catProds.length === 0) return null; // Hide category if searching and no products match
              
              const a = cat.periodA || {};
              const b = cat.periodB || {};

              return (
                <React.Fragment key={cat.category}>
                  <tr className="category-row" onClick={() => toggleCat(cat.category)}>
                    <td className="sticky-col">
                      <div className="cat-name">
                        {isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                        <strong>{cat.category}</strong>
                        {a.noFisMatchPct > 0 && (
                          <span className="fis-completeness" title={`${formatPercent(a.noFisMatchPct)} missing FIS`}>
                            <AlertTriangle size={12} />
                          </span>
                        )}
                      </div>
                    </td>
                    {columns.map(col => (
                      <MetricCell 
                        key={col.key} 
                        valA={a[col.key]} 
                        valB={b[col.key]} 
                        mode={periodMode} 
                        formatter={col.formatter} 
                        type={col.type} 
                      />
                    ))}
                  </tr>
                  
                  {isExpanded && catProds.map(prod => {
                    const pa = prod.periodA || {};
                    const pb = prod.periodB || {};
                    const hasWarning = pa.isCartAddsGreater || pb.isCartAddsGreater;
                    return (
                      <tr key={prod.normalizedName} className="product-row">
                        <td className="sticky-col prod-name-cell">
                          <span className="prod-name" title={prod.productName}>{prod.productName}</span>
                          {hasWarning && <AlertTriangle size={12} className="warning-icon" title="Cart Adds > Views" />}
                          {pa.fisUsers === null && <span className="no-fis-badge">No FIS</span>}
                        </td>
                        {columns.map(col => (
                          <MetricCell 
                            key={col.key} 
                            valA={pa[col.key]} 
                            valB={pb[col.key]} 
                            mode={periodMode} 
                            formatter={col.formatter} 
                            type={col.type} 
                          />
                        ))}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
