import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';

export const FunnelChart = ({ data, periodMode, isCombined }) => {
  // data should be an object representing a product or a category, or the overall total
  // periodMode: 'current', 'comparison', 'both'
  
  // We need to shape this for Recharts
  // Recharts wants an array of objects for the X axis
  
  const stages = [
    { name: 'Views', keyA: 'viewsA', keyB: 'viewsB' },
    { name: 'Cart Adds', keyA: 'cartA', keyB: 'cartB' },
    { name: 'Purchases', keyA: 'purchasesA', keyB: 'purchasesB' }
  ];
  
  const chartData = stages.map(stage => {
    return {
      name: stage.name,
      Current: data.periodA ? data.periodA[stage.keyA === 'viewsA' ? 'views' : stage.keyA === 'cartA' ? 'cartAdds' : 'purchases'] : 0,
      Comparison: data.periodB ? data.periodB[stage.keyB === 'viewsB' ? 'views' : stage.keyB === 'cartB' ? 'cartAdds' : 'purchases'] : 0,
    };
  });

  // Calculate FIS points to overlay
  // FIS is a single rate, so we can just attach it to the "Views" bar or draw a line across
  // We will add it to the first stage just to show it, or we can make it a flat line across all stages for visual overlay
  chartData.forEach(d => {
    if (data.periodA && data.periodA.fisIntentRate !== undefined && data.periodA.fisIntentRate !== null) {
      d.FIS_Current = data.periodA.fisIntentRate * 100;
    }
    if (data.periodB && data.periodB.fisIntentRate !== undefined && data.periodB.fisIntentRate !== null) {
      d.FIS_Comparison = data.periodB.fisIntentRate * 100;
    }
  });
  
  const hasCartExceedsViewsA = data.periodA?.isCartAddsGreater;
  const hasCartExceedsViewsB = data.periodB?.isCartAddsGreater;

  return (
    <div className="funnel-chart-container">
      {(hasCartExceedsViewsA || hasCartExceedsViewsB) && (
        <div className="cart-warning-banner">
          Warning: Cart additions exceed attributed views for this slice.
        </div>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
          <XAxis dataKey="name" tick={{fill: '#e2e8f0'}} />
          <YAxis yAxisId="left" tick={{fill: '#e2e8f0'}} />
          <YAxis yAxisId="right" orientation="right" tick={{fill: '#e2e8f0'}} tickFormatter={(v) => `${v}%`} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
            itemStyle={{ color: '#fff' }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          
          {(periodMode === 'current' || periodMode === 'both') && (
             <Bar yAxisId="left" dataKey="Current" fill="#3b82f6" radius={[4,4,0,0]} maxBarSize={60} />
          )}
          
          {(periodMode === 'comparison' || periodMode === 'both') && data.periodB && (
             <Bar yAxisId="left" dataKey="Comparison" fill="#94a3b8" radius={[4,4,0,0]} maxBarSize={60} />
          )}
          
          {(periodMode === 'current' || periodMode === 'both') && (
            <Line yAxisId="right" type="monotone" dataKey="FIS_Current" name="FIS Intent % (Current)" stroke="#f59e0b" strokeWidth={3} dot={{ r: 6 }} activeDot={{ r: 8 }} />
          )}
          
          {(periodMode === 'comparison' || periodMode === 'both') && data.periodB && (
            <Line yAxisId="right" type="monotone" dataKey="FIS_Comparison" name="FIS Intent % (Comp)" stroke="#d97706" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 6 }} />
          )}
          
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
