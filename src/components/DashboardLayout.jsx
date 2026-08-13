import React, { useState } from 'react';
import { UploadZone } from './UploadZone';
import { FunnelChart } from './FunnelChart';
import { DataTable } from './DataTable';
import { useDashboardData } from '../hooks/useDashboardData';
import { RefreshCcw } from 'lucide-react';

export const DashboardLayout = () => {
  const { files, data, isProcessing, error, handleFileUpload, processData, clearData } = useDashboardData();
  
  const [activeTab, setActiveTab] = useState('web'); // web, app, combined
  const [periodMode, setPeriodMode] = useState('current'); // current, comparison, both
  
  const hasData = data.periodA !== null;
  const hasComparison = data.periodB !== null;

  return (
    <div className="dashboard-layout">
      <header className="dashboard-header">
        <h1>PDP Funnel & Demand Dashboard</h1>
        {hasData && (
          <button className="reset-btn" onClick={clearData}>
            <RefreshCcw size={16} /> Start Over
          </button>
        )}
      </header>
      
      <main className="dashboard-content">
        {!hasData ? (
          <div className="upload-container">
            {error && <div className="error-banner">{error}</div>}
            <UploadZone 
              files={files} 
              onFileUpload={handleFileUpload} 
              onProcess={processData} 
              isProcessing={isProcessing} 
            />
          </div>
        ) : (
          <div className="results-container">
            
            <div className="controls-bar">
              <div className="tabs">
                <button className={`tab ${activeTab === 'web' ? 'active' : ''}`} onClick={() => setActiveTab('web')}>Web Data</button>
                <button className={`tab ${activeTab === 'app' ? 'active' : ''}`} onClick={() => setActiveTab('app')}>App Data</button>
                <button className={`tab ${activeTab === 'combined' ? 'active' : ''}`} onClick={() => setActiveTab('combined')}>Combined</button>
              </div>
              
              <div className="period-toggles">
                <button className={`toggle ${periodMode === 'current' ? 'active' : ''}`} onClick={() => setPeriodMode('current')}>Current Only</button>
                {hasComparison && (
                  <>
                    <button className={`toggle ${periodMode === 'comparison' ? 'active' : ''}`} onClick={() => setPeriodMode('comparison')}>Comparison Only</button>
                    <button className={`toggle ${periodMode === 'both' ? 'active' : ''}`} onClick={() => setPeriodMode('both')}>Period vs Period</button>
                  </>
                )}
              </div>
            </div>
            
            {/* We pass the active tab's data directly to components */}
            <div className="dashboard-grid">
              <div className="chart-section">
                <h2>Funnel & FIS Overlay ({activeTab.toUpperCase()})</h2>
                <FunnelChart 
                  data={{
                    periodA: data.periodA[activeTab].summary, // Passing total summary for top-level chart
                    periodB: data.periodB ? data.periodB[activeTab].summary : null
                  }} 
                  periodMode={periodMode}
                  isCombined={activeTab === 'combined'}
                />
              </div>
              
              <div className="table-section">
                <h2>Category & Product Breakdown</h2>
                <DataTable 
                  data={{
                    periodA: data.periodA[activeTab],
                    periodB: data.periodB ? data.periodB[activeTab] : null
                  }}
                  periodMode={periodMode}
                  isCombined={activeTab === 'combined'}
                />
              </div>
            </div>
            
          </div>
        )}
      </main>
    </div>
  );
};
