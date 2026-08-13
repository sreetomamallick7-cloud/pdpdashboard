import { useState, useCallback, useMemo } from 'react';

export const useDashboardData = () => {
  const [files, setFiles] = useState({
    periodA: { web: null, app: null, fisWeb: null, fisApp: null },
    periodB: { web: null, app: null, fisWeb: null, fisApp: null },
  });
  
  const [data, setData] = useState({
    periodA: null, // { web: { products, categories, summary }, app: {...}, combined: {...} }
    periodB: null,
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleFileUpload = (period, type, file) => {
    setFiles(prev => ({
      ...prev,
      [period]: {
        ...prev[period],
        [type]: file
      }
    }));
  };

  const processPeriod = (periodId, periodFiles) => {
    return new Promise((resolve, reject) => {
      // Create a new worker instance
      const worker = new Worker(new URL('../workers/dataProcessor.worker.js', import.meta.url), { type: 'module' });
      
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
      
      worker.postMessage({ periodId, files: periodFiles });
    });
  };

  const processData = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const results = { periodA: null, periodB: null };
      
      // We only process if at least web or app is present for Period A
      if (files.periodA.web || files.periodA.app) {
        results.periodA = await processPeriod('periodA', files.periodA);
      } else {
        throw new Error('Please upload at least Web or App data for the Current Period (Period A).');
      }
      
      if (files.periodB.web || files.periodB.app) {
        results.periodB = await processPeriod('periodB', files.periodB);
      }
      
      setData(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearData = () => {
    setFiles({
      periodA: { web: null, app: null, fisWeb: null, fisApp: null },
      periodB: { web: null, app: null, fisWeb: null, fisApp: null },
    });
    setData({ periodA: null, periodB: null });
    setError(null);
  };

  return {
    files,
    data,
    isProcessing,
    error,
    handleFileUpload,
    processData,
    clearData
  };
};
