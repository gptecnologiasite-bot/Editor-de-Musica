import React from 'react';
import { Play, Pause, Maximize, ChevronLeft, ChevronRight, Image as ImageIcon, Settings, Sliders } from 'lucide-react';

const PresentationStation = ({
  slides = [],
  currentSlide = 0,
  isPresenting,
  autoSlideSeconds,
  fontSize,
  bgImage,
  bgOpacity,
  onTogglePlay,
  onNext,
  onPrev,
  onFullscreen,
  onAutoSlideChange,
  onFontSizeChange,
  onImageUpload,
  onOpacityChange,
}) => {
  const activeText = (slides && slides[currentSlide]) || 'Selecione uma música para começar';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}>
        <Play size={18} fill="#38bdf8" color="#38bdf8" /> Estação de Slides
      </div>

      {/* Slide Preview Surface */}
      <div
        id="presentation-surface"
        style={{
          position: 'relative',
          aspectRatio: '16/9',
          borderRadius: 20,
          overflow: 'hidden',
          background: '#020617',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          border: '1px solid rgba(148, 163, 184, 0.1)',
        }}
      >
        {/* Background Layer */}
        {bgImage && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: bgOpacity / 100,
              transition: 'opacity 0.3s ease',
            }}
          />
        )}

        {/* Text Layer */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            textAlign: 'center',
            color: '#ffffff',
            fontSize: `${fontSize}px`,
            fontWeight: 800,
            lineHeight: 1.25,
            whiteSpace: 'pre-wrap',
            textShadow: '0 4px 12px rgba(0,0,0,0.8)',
            maxWidth: '100%',
          }}
        >
          {activeText}
        </div>

        {/* Slide Counter Overlay */}
        <div style={{ position: 'absolute', bottom: 16, right: 20, fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
          {currentSlide + 1} / {slides?.length || 1}
        </div>
      </div>

      {/* Play Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        <button onClick={onPrev} className="control-btn"><ChevronLeft size={20} /></button>
        <button onClick={onTogglePlay} className="control-btn primary">
          {isPresenting ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
        <button onClick={onNext} className="control-btn"><ChevronRight size={20} /></button>
        <button onClick={onFullscreen} className="control-btn" title="Tela Cheia"><Maximize size={20} /></button>
      </div>

      {/* Settings Panel */}
      <div className="modern-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
          <Settings size={14} /> Configurações do Player
        </div>

        <div className="settings-row">
          <div className="setting-item">
            <span className="setting-label">Tempo do Slide (s)</span>
            <input 
              type="number" 
              className="modern-input small" 
              value={autoSlideSeconds} 
              onChange={(e) => onAutoSlideChange(Number(e.target.value))} 
              min="1"
            />
          </div>
          <div className="setting-item">
            <span className="setting-label">Tamanho da Fonte: {fontSize}px</span>
            <input 
              type="range" 
              min="24" 
              max="72" 
              value={fontSize} 
              onChange={(e) => onFontSizeChange(Number(e.target.value))} 
              className="modern-range"
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="setting-item">
            <span className="setting-label">Imagem de Fundo</span>
            <label className="image-upload-btn">
              <ImageIcon size={14} /> {bgImage ? 'Alterar' : 'Subir Imagem'}
              <input type="file" onChange={onImageUpload} style={{ display: 'none' }} accept="image/*" />
            </label>
          </div>
          <div className="setting-item">
            <span className="setting-label">Opacidade: {bgOpacity}%</span>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={bgOpacity} 
              onChange={(e) => onOpacityChange(Number(e.target.value))} 
              className="modern-range"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresentationStation;
