import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, AlertTriangle } from 'lucide-react';

const FileSlot = ({ label, file, onUpload, accept }) => {
  return (
    <div className="file-slot">
      <label className="file-slot-label">{label}</label>
      <div className={`file-slot-dropzone ${file ? 'has-file' : ''}`}>
        {file ? (
          <div className="file-info">
            <FileText size={24} className="file-icon" />
            <span className="file-name" title={file.name}>{file.name}</span>
          </div>
        ) : (
          <div className="file-prompt">
            <UploadCloud size={24} className="upload-icon" />
            <span>Drop CSV or click</span>
          </div>
        )}
        <input 
          type="file" 
          accept={accept || ".csv"} 
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUpload(e.target.files[0]);
            }
          }}
        />
      </div>
    </div>
  );
};

export const UploadZone = ({ files, onFileUpload, onProcess, isProcessing }) => {
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    // Check for duplicate FIS files
    const checkDups = (period, name) => {
      const f1 = files[period].fisWeb;
      const f2 = files[period].fisApp;
      if (f1 && f2 && f1.size === f2.size && f1.name === f2.name && f1.lastModified === f2.lastModified) {
        return `Warning: ${name} FIS-Web and FIS-App files appear identical. They will be aggregated separately.`;
      }
      return null;
    };
    
    const w = [
      checkDups('periodA', 'Current Period'),
      checkDups('periodB', 'Comparison Period')
    ].filter(Boolean);
    
    setWarnings(w);
  }, [files]);

  const canProcess = files.periodA.web || files.periodA.app;

  return (
    <div className="upload-zone-container">
      <div className="upload-periods">
        
        <div className="upload-period">
          <h3>Current Period (Required)</h3>
          <div className="slots-grid">
            <FileSlot label="Web Data" file={files.periodA.web} onUpload={(f) => onFileUpload('periodA', 'web', f)} />
            <FileSlot label="App Data" file={files.periodA.app} onUpload={(f) => onFileUpload('periodA', 'app', f)} />
            <FileSlot label="FIS - Web" file={files.periodA.fisWeb} onUpload={(f) => onFileUpload('periodA', 'fisWeb', f)} />
            <FileSlot label="FIS - App" file={files.periodA.fisApp} onUpload={(f) => onFileUpload('periodA', 'fisApp', f)} />
          </div>
        </div>
        
        <div className="upload-period">
          <h3>Comparison Period (Optional)</h3>
          <div className="slots-grid">
            <FileSlot label="Web Data" file={files.periodB.web} onUpload={(f) => onFileUpload('periodB', 'web', f)} />
            <FileSlot label="App Data" file={files.periodB.app} onUpload={(f) => onFileUpload('periodB', 'app', f)} />
            <FileSlot label="FIS - Web" file={files.periodB.fisWeb} onUpload={(f) => onFileUpload('periodB', 'fisWeb', f)} />
            <FileSlot label="FIS - App" file={files.periodB.fisApp} onUpload={(f) => onFileUpload('periodB', 'fisApp', f)} />
          </div>
        </div>

      </div>
      
      {warnings.length > 0 && (
        <div className="upload-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="warning-msg">
              <AlertTriangle size={16} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="upload-actions">
        <button 
          className="process-btn" 
          onClick={onProcess} 
          disabled={!canProcess || isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Process Data'}
        </button>
      </div>
    </div>
  );
};
