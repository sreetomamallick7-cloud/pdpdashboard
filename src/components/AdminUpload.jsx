import React, { useState } from 'react';
import { UploadZone } from './UploadZone';
import { useDashboardData } from '../hooks/useDashboardData';
import { supabase } from '../config/supabaseClient';
import { CheckCircle, AlertTriangle, UploadCloud, FileText } from 'lucide-react';
import Papa from 'papaparse';
import { processNewMatches } from '../utils/matchingLogic';
import './AdminUpload.css';

export const AdminUpload = () => {
  const { files, handleFileUpload } = useDashboardData();
  const [activeTab, setActiveTab] = useState('engagement'); // 'engagement' or 'attributes'
  
  // Engagement state
  const [uploadDate, setUploadDate] = useState('');
  
  // Attributes state
  const [attrFile, setAttrFile] = useState(null);

  // Common state
  const [uploadStatus, setUploadStatus] = useState(null); // 'success', 'error', 'uploading'
  const [statusMessage, setStatusMessage] = useState('');

  const handleProcessAndPush = async () => {
    if (!uploadDate) {
      setUploadStatus('error');
      setStatusMessage('Please select a Period Date before uploading.');
      return;
    }

    setUploadStatus('uploading');
    setStatusMessage('Processing data locally...');

    try {
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

      setStatusMessage('Pushing Category & Product Metrics to Supabase...');
      
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

      const categoryPayload = [
        ...mapCategoriesToDB(combinedCategories, 'combined'),
        ...mapCategoriesToDB(webCategories, 'web'),
        ...mapCategoriesToDB(appCategories, 'app'),
      ];

      // 1. Delete existing data for this date to ensure we cleanly overwrite (no duplicates)
      setStatusMessage('Clearing previous data for this date...');
      await supabase.from('category_metrics').delete().eq('upload_date', uploadDate);
      await supabase.from('product_metrics').delete().eq('upload_date', uploadDate);

      // Insert Category Metrics
      setStatusMessage('Pushing new Category Metrics...');
      const { error: catError } = await supabase
        .from('category_metrics')
        .insert(categoryPayload);
      if (catError) throw catError;

      // Extract and map product-level metrics for the new product_metrics table
      // We push product metrics for 'web', 'app', and 'combined' as well.
      const mapProductsToDB = (products, platform) => {
        return products.map(p => ({
          upload_date: uploadDate,
          product_identifier: p.productName || p.normalizedName,
          category: p.category,
          platform: platform,
          views: p.views,
          cart_adds: p.cartAdds,
          purchases: p.purchases,
          revenue: p.revenue,
          fis_users: p.fisUsers
        }));
      };

      const productPayload = [
        ...mapProductsToDB(processedData.combined.products, 'combined'),
        ...mapProductsToDB(processedData.web.products, 'web'),
        ...mapProductsToDB(processedData.app.products, 'app'),
      ];

      // Insert Product Metrics in chunks to prevent statement timeouts
      const CHUNK_SIZE = 500; // Safe chunk size for PostgREST
      for (let i = 0; i < productPayload.length; i += CHUNK_SIZE) {
        const chunk = productPayload.slice(i, i + CHUNK_SIZE);
        const { error: prodError } = await supabase
          .from('product_metrics')
          .upsert(chunk, { onConflict: 'upload_date,product_identifier,platform' });
        if (prodError) throw prodError;
      }

      // Now run matching logic on the new products vs sku_attribute_master
      setStatusMessage('Updating SKU Attribute Bridge...');
      
      // Get all unique product identifiers with their category
      const uniqueProductsMap = new Map();
      productPayload.forEach(p => {
          if (!uniqueProductsMap.has(p.product_identifier)) {
              uniqueProductsMap.set(p.product_identifier, p.category);
          }
      });
      const uniqueProductsList = Array.from(uniqueProductsMap.entries()).map(([identifier, category]) => ({
          identifier,
          category
      }));
      
      const { newMatches } = await processNewMatches(uniqueProductsList);
      
      setStatusMessage('Refreshing Material Type Metrics...');
      const { error: refreshError } = await supabase.rpc('refresh_material_metrics');
      if (refreshError && refreshError.code !== '42883') {
        console.warn('Failed to refresh materialized view:', refreshError);
      }
      
      setUploadStatus('success');
      setStatusMessage(`Data successfully processed and uploaded! Created ${newMatches} new bridge matches.`);
      
    } catch (err) {
      console.error(err);
      setUploadStatus('error');
      setStatusMessage(err.message ? err.message : 'Unknown Error');
    }
  };

  const handleAttributeUpload = async () => {
    if (!attrFile) return;
    setUploadStatus('uploading');
    setStatusMessage('Parsing attribute master file...');

    Papa.parse(attrFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          setStatusMessage('Pushing attributes to Supabase...');
          
          const payload = results.data.map(row => {
            const baseSku = row['BASE SKU'];
            const category = row['CATEGORY'];
            
            // Remove them to keep only the dynamic attributes
            const attributes = { ...row };
            delete attributes['BASE SKU'];
            delete attributes['CATEGORY'];

            if (!baseSku) return null;

            return {
              base_sku: String(baseSku).trim(),
              category: category ? String(category).trim() : 'Unmapped',
              attributes: attributes
            };
          }).filter(Boolean);

          if (payload.length === 0) {
            throw new Error("No valid rows found. Ensure 'BASE SKU' column exists.");
          }

          // Chunk the upload if large
          const CHUNK_SIZE = 500;
          let count = 0;
          for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
            const chunk = payload.slice(i, i + CHUNK_SIZE);
            const { error } = await supabase
              .from('sku_attribute_master')
              .upsert(chunk, { onConflict: 'base_sku' });
            
            if (error) throw error;
            count += chunk.length;
          }
          
          setUploadStatus('success');
          setStatusMessage(`Successfully uploaded ${count} SKUs to the attribute master!`);
        } catch (err) {
          setUploadStatus('error');
          setStatusMessage(err.message);
        }
      },
      error: (err) => {
        setUploadStatus('error');
        setStatusMessage(err.message);
      }
    });
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h2>Admin Data Upload</h2>
        <p>Process your raw CSV files and manage master reference data.</p>
      </div>

      <div className="admin-tabs">
        <button 
          className={`tab-btn ${activeTab === 'engagement' ? 'active' : ''}`}
          onClick={() => { setActiveTab('engagement'); setUploadStatus(null); }}
        >
          Engagement Data
        </button>
        <button 
          className={`tab-btn ${activeTab === 'attributes' ? 'active' : ''}`}
          onClick={() => { setActiveTab('attributes'); setUploadStatus(null); }}
        >
          SKU Attribute Master
        </button>
      </div>

      {activeTab === 'engagement' && (
        <>
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
            <p className="admin-note">Note: For Admin Uploads, only the "Current Period" files are processed. The Comparison Period is ignored.</p>
          </div>
        </>
      )}

      {activeTab === 'attributes' && (
        <div className="upload-wrapper">
           <div className="single-file-upload">
            {attrFile ? (
               <>
                 <FileText size={48} color="#888" />
                 <span>{attrFile.name}</span>
               </>
            ) : (
               <>
                 <UploadCloud size={48} color="#888" />
                 <span>Drop Reference Attribute CSV here or click to browse</span>
               </>
            )}
            <input 
              type="file" 
              accept=".csv"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setAttrFile(e.target.files[0]);
                }
              }}
            />
          </div>
          <div className="attr-actions">
            <button 
              className="process-btn" 
              onClick={handleAttributeUpload} 
              disabled={!attrFile || uploadStatus === 'uploading'}
            >
              {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload Attribute Master'}
            </button>
          </div>
          <p className="admin-note">The CSV must contain a "BASE SKU" column and optionally a "CATEGORY" column. All other columns will be auto-detected as dynamic attributes.</p>
        </div>
      )}

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

