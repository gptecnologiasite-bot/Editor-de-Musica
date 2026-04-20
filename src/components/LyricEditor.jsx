import React from 'react';
import { Wand2, Shrink, Type, Users, List, Hash, Repeat } from 'lucide-react';

const LyricEditor = ({ 
  title, artist, lyrics, 
  onTitleChange, onArtistChange, onLyricsChange,
  onAutoEdit, onShorten, 
  isProcessing,
  stats 
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Inputs */}
      <div className="form-grid">
        <div className="input-group">
          <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Type size={14} /> Título da Música
          </label>
          <input
            type="text"
            className="modern-input"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Ex: 007 - Cristo Cura, Sim!"
          />
        </div>
        <div className="input-group">
          <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} /> Artista ou Cantor
          </label>
          <input
            type="text"
            className="modern-input"
            value={artist}
            onChange={(e) => onArtistChange(e.target.value)}
            placeholder="Ex: Harpa Cristã"
          />
        </div>
      </div>

      {/* Editor Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>Letra</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            onClick={onAutoEdit}
            className="tool-button"
            title="Padronizar layout (Estrofes)"
          >
            <Wand2 size={16} /> Auto Editar
          </button>
          <button 
            onClick={onShorten}
            className="tool-button primary"
            disabled={isProcessing}
            title="Reduzir letra via IA (Gospel)"
          >
            <Shrink size={16} /> {isProcessing ? 'Processando...' : 'Reduzir Letra'}
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div style={{ position: 'relative' }}>
        <textarea
          className="modern-textarea"
          value={lyrics}
          onChange={(e) => onLyricsChange(e.target.value)}
          placeholder="Digite ou cole a letra aqui..."
          rows={20}
        />
      </div>

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <List size={14} /> <span>Linhas: <strong>{stats?.lines || 0}</strong></span>
        </div>
        <div className="stat-item">
          <Hash size={14} /> <span>Palavras: <strong>{stats?.words || 0}</strong></span>
        </div>
        <div className="stat-item">
          <Repeat size={14} /> <span>Duplicadas: <strong>{stats?.duplicates || 0}</strong></span>
        </div>
      </div>
    </div>
  );
};

export default LyricEditor;
