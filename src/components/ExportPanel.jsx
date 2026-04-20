import React from 'react';
import { Download, FileDown, Layers, FilePieChart, FileText, Archive } from 'lucide-react';

const ExportPanel = ({ onExport, isExporting }) => {
  return (
    <div className="modern-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc', fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
        <Download size={18} /> Exportar Arquivo
      </div>

      <div className="export-grid">
        <button 
          onClick={() => onExport('mufl')} 
          className="export-btn"
          disabled={isExporting}
        >
          <div className="format-tag mufl">MUFL</div>
          <span className="format-label">JSON Oficial</span>
          <FileDown size={16} />
        </button>

        <button 
          onClick={() => onExport('hbac')} 
          className="export-btn"
          disabled={isExporting}
        >
          <div className="format-tag hbac">HBAC</div>
          <span className="format-label">Apresentação</span>
          <Layers size={16} />
        </button>

        <button 
          onClick={() => onExport('ppt')} 
          className="export-btn"
          disabled={isExporting}
        >
          <div className="format-tag ppt">PPT</div>
          <span className="format-label">PowerPoint</span>
          <FilePieChart size={16} />
        </button>

        <button 
          onClick={() => onExport('txt')} 
          className="export-btn"
          disabled={isExporting}
        >
          <div className="format-tag txt">TXT</div>
          <span className="format-label">Texto Puro</span>
          <FileText size={16} />
        </button>

        <button 
          onClick={() => onExport('zip')} 
          className="export-btn full-width"
          disabled={isExporting}
          style={{ gridColumn: 'span 2', marginTop: 10, background: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.3)', color: '#a5b4fc' }}
        >
          <Archive size={16} />
          <span className="format-label">Gerar Pacote ZIP (Todos)</span>
        </button>
      </div>

      {isExporting && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#38bdf8', textAlign: 'center', fontWeight: 600 }}>
          Gerando arquivos...
        </div>
      )}
    </div>
  );
};

export default ExportPanel;
