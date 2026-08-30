import { useState, useRef } from 'react';
import { FileText, Upload, Sparkles, AlertCircle, FileCheck, ArrowRight } from 'lucide-react';
import { parsePrescription } from '../../lib/api';
import { LoadingSpinner } from '../shared/SharedComponents';

export default function PhysioUpload({ onPrescriptionParsed, onSwitchMode }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);
  };

  const handleUpload = async (fileToParse = file) => {
    setLoading(true);
    setError(null);

    try {
      const data = await parsePrescription(fileToParse);
      setLoading(false);
      onPrescriptionParsed(data);
    } catch (err) {
      console.error('Prescription parsing failed:', err);
      setLoading(false);
      setError('Unable to parse document. Please check the file format or try again.');
    }
  };

  return (
    <div className="page">
      <div className="app-container" style={{ maxWidth: 680 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ fontSize: '2.2rem', margin: 0, color: '#ffffff' }}>PhysioGuard AI</h1>
              <span className="badge badge-purple">Rehab Observer</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
              Follow your prescribed exercises and monitor your movement.
            </p>
          </div>
          {onSwitchMode && (
            <button className="btn btn-ghost btn-sm" onClick={onSwitchMode}>
              Switch Mode
            </button>
          )}
        </div>

        {/* Upload Card */}
        <div className="card slide-up" style={{ padding: '2.5rem 1.75rem', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(129, 140, 248, 0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.25rem',
            border: '1px solid rgba(129, 140, 248, 0.3)'
          }}>
            <FileText size={36} color="#818cf8" />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Upload Physiotherapy Report
          </h2>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: 460, margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
            Upload the exercise prescription or rehabilitation sheet provided by your physiotherapist (PDF, JPG, JPEG, PNG).
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/png,image/jpeg,image/jpg"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {/* Upload Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${file ? '#818cf8' : 'var(--border)'}`,
              borderRadius: 16,
              padding: '1.75rem 1rem',
              background: file ? 'rgba(129, 140, 248, 0.06)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              marginBottom: '1.5rem',
              transition: 'border-color 0.2s'
            }}
          >
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#a5b4fc' }}>
                <FileCheck size={24} color="#818cf8" />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{file.name}</span>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>
                <Upload size={24} style={{ margin: '0 auto 0.5rem' }} />
                <p style={{ fontSize: '0.88rem', margin: 0 }}>Click to choose a report file</p>
                <p style={{ fontSize: '0.76rem', marginTop: 4 }}>Supports PDF, PNG, JPG</p>
              </div>
            )}
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--accent-red)', fontSize: '0.88rem', marginBottom: '1rem' }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              id="btn-upload-report"
              className="btn"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#fff',
                padding: '0.85rem 1.75rem',
                borderRadius: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: 'none',
                minWidth: 180
              }}
              onClick={() => handleUpload(file)}
              disabled={loading}
            >
              {loading ? (
                <><LoadingSpinner size={18} color="#fff" /> Parsing with Gemini…</>
              ) : (
                <><Sparkles size={18} /> Parse Prescription</>
              )}
            </button>

            <button
              id="btn-sample-report"
              className="btn btn-secondary"
              style={{ padding: '0.85rem 1.25rem', borderRadius: 12 }}
              onClick={() => handleUpload(null)}
              disabled={loading}
            >
              Use Sample ACL Rehab Sheet <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
