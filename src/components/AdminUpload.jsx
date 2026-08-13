import React, { useState } from 'react';
import { UploadZone } from './UploadZone';
import { useDashboardData } from '../hooks/useDashboardData';
import { supabase } from '../config/supabaseClient';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import './AdminUpload.css';

export const AdminUpload = () => {
  const { files, handleFileUpload } = useDashboardData();
  const [uploadDate, setUploadDate] = useState('');
  const [uploadStatus, setUploadStatus] = useState(null); // 'success', 'error', 'uploading'
  const [statusMessage, setStatusMessage] = useState('');

  // We customize the process flow to intercept the local processing and push to Supabase
  const handleProcessAndPush = async () => {
    if (!uploadDate) {
      setUploadStatus('error');
      setStatusMessage('Please select a Period Date before uploading.');
      return;
    }

    setUploadStatus('uploading');
    setStatusMessage('Processing data locally...');

    // We only need periodA for this upload to DB
    try {
      // Create a temporary promise to intercept the processed data
      // useDashboardData's processData sets state, but we need the raw results.
      // We will re-implement the worker call here to have direct access to the result.
      const worker = new Worker(new URL('../workers/dataProcessor.worker.js', import.meta.url), { type: 'module' });
      
      const processedData = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'SUCCESS') {
            resolve(e.data.data);
            worker.terminate();
          } else if (e.data.type === 'ERROR') {
            reject(new Error(e.data.error));
            worker.terminate();
          }
        };
        worker.onerror = (err) => {
          reject(err);
          worker.terminate();
        };
        worker.postMessage({ periodId: 'admin_upload', files: files.periodA });
      });

      setStatusMessage('Pushing to Supabase...');
      
      const combinedCategories = processedData.combined.categories;
      const webCategories = processedData.web.categories;
      const appCategories = processedData.app.categories;
      
      const mapCategoriesToDB = (categories, platform) => {
        return categories.map(c => ({
          upload_date: uploadDate,
          category: c.category,
          platform: platform,
          views: c.views,
          cart_adds: c.cartAdds,
          purchases: c.purchases,
          fis_users: c.fisUsers,
          pdp_to_cart_rate: c.pdpToCartRate,
          overall_conv_rate: c.overallConvRate,
          fis_intent_rate: c.fisIntentRate
        }));
      };

      const dbPayload = [
        ...mapCategoriesToDB(combinedCategories, 'combined'),
        ...mapCategoriesToDB(webCategories, 'web'),
        ...mapCategoriesToDB(appCategories, 'app'),
      ];

      const { error: dbError } = await supabase
        .from('category_metrics')
        .insert(dbPayload);

      if (dbError) throw dbError;

      setUploadStatus('success');
      setStatusMessage('Data successfully processed and uploaded to Supabase!');
      
    } catch (err) {
      console.error(err);
      setUploadStatus('error');
      setStatusMessage(err.message ? err.message + ' ' + JSON.stringify(err) : 'Error: ' + JSON.stringify(err, Object.getOwnPropertyNames(err)));
    }
  };

  // We hide the Comparison period by only showing the first child of UploadZone,
  // or we can just pass the files and ignore periodB. The UploadZone is a bit rigid, 
  // so we'll just let them use it but add our date picker on top.
  
  return (
    <div className="admin-container">
      <div className="admin-header">
        <h2>Admin Data Upload</h2>
        <p>Process your raw CSV files and push the aggregated category data to Supabase for historical trend tracking.</p>
      </div>

      <div className="admin-controls">
        <label className="date-label">
          <strong>Select Period Date:</strong>
          <input 
            type="date" 
            value={uploadDate} 
            onChange={(e) => setUploadDate(e.target.value)} 
            className="date-input"
          />
        </label>
      </div>

      <div className="upload-wrapper">
        <UploadZone 
          files={files}
          onFileUpload={handleFileUpload}
          onProcess={handleProcessAndPush}
          isProcessing={uploadStatus === 'uploading'}
        />
        {/* Note: UploadZone has a "Comparison Period", we can tell the user to ignore it for Admin Upload */}
        <p className="admin-note">Note: For Admin Uploads, only the "Current Period" files are processed. The Comparison Period is ignored.</p>
      </div>

      {uploadStatus === 'success' && (
        <div className="status-banner success">
          <CheckCircle size={20} />
          <span>{statusMessage}</span>
        </div>
      )}

      {uploadStatus === 'error' && (
        <div className="status-banner error">
          <AlertTriangle size={20} />
          <span>{statusMessage}</span>
        </div>
      )}
      
      {uploadStatus === 'uploading' && (
        <div className="status-banner info">
          <span className="spinner"></span>
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
};
