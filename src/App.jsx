import { useEffect, useState, useCallback, useMemo } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { 
  FolderPlus, FilePlus, ChevronRight, ChevronDown, FileText, Folder, FolderOpen,
  Wand2, Shrink, Type, Users, List, Hash, Repeat,
  Play, Pause, Maximize, ChevronLeft, Download, FileDown, Layers, FilePieChart, Archive, Settings, Image as ImageIcon
} from 'lucide-react';

// --- Utilitários ---
function normalizeName(name) {
  if (!name) return 'musica';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

// --- Componentes Internos Organizados ---

const Sidebar = ({ folders = [], onToggleFolder, onSelectFile, onNewFile, onNewFolder, onImportFolder, selectedFileId }) => {
  const renderTree = (node, depth = 0) => {
    if (!node || depth > 10) return null;
    const isSelected = selectedFileId === node.id;
    const paddingLeft = depth * 12 + 16;

    if (node.type === 'folder') {
      return (
        <div key={node.id} className="sidebar-group">
          <div
            onClick={(e) => { e.stopPropagation(); onToggleFolder?.(node.id); }}
            className="sidebar-item folder"
            style={{ paddingLeft, color: node.isExpanded ? '#f1f5f9' : '#64748b' }}
          >
            {node.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Folder size={16} color="#38bdf8" fill={node.isExpanded ? "rgba(56, 189, 248, 0.2)" : "none"} />
            <span>{node.name}</span>
          </div>
          {node.isExpanded && node.children && (
            <div className="folder-content">
              {node.children.map(child => renderTree(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.id}
        onClick={(e) => { e.stopPropagation(); onSelectFile?.(node); }}
        className={`sidebar-item file ${isSelected ? 'active' : ''}`}
        style={{ paddingLeft: paddingLeft + 20 }}
      >
        <FileText size={14} opacity={0.6} />
        <span>{node.name}</span>
      </div>
    );
  };

  return (
    <div className="sidebar-area">
      <div className="sidebar-header">
        <span className="sidebar-title">BIBLIOTECA</span>
        <div className="sidebar-actions">
          <label className="icon-btn" title="Importar Pasta" style={{ cursor: 'pointer' }}>
            <FolderOpen size={14} />
            <input 
              type="file" 
              webkitdirectory="" 
              directory="" 
              multiple 
              onChange={(e) => {
                if (e.target.files.length > 0) {
                  onImportFolder?.(Array.from(e.target.files));
                }
              }} 
              style={{ display: 'none' }} 
            />
          </label>
          <button onClick={onNewFile} className="icon-btn" title="Nova Música"><FilePlus size={14} /></button>
          <button onClick={onNewFolder} className="icon-btn" title="Nova Pasta"><FolderPlus size={14} /></button>
        </div>
      </div>
      <div className="sidebar-scroll">
        {folders.map(n => renderTree(n))}
      </div>
    </div>
  );
};

const LyricEditor = ({ title, artist, lyrics, onTitleChange, onArtistChange, onLyricsChange, onAutoEdit, onShorten, isProcessing, stats }) => (
  <div className="main-editor-area">
    <div className="editor-header-grid">
      <div className="input-field">
        <label><Type size={12} /> TÍTULO</label>
        <input className="modern-input" value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="001 - Exemplo de Música" />
      </div>
      <div className="input-field">
        <label><Users size={12} /> ARTISTA</label>
        <input className="modern-input" value={artist} onChange={(e) => onArtistChange(e.target.value)} placeholder="Harpa Cristã" />
      </div>
    </div>

    <div className="editor-toolbar">
      <h2 className="section-subtitle">Letra da Música</h2>
      <div className="toolbar-actions">
        <button onClick={onAutoEdit} className="tool-button"><Wand2 size={14} /> Normalizar</button>
        <button onClick={onShorten} className="tool-button primary" disabled={isProcessing}>
           {isProcessing ? 'Processando...' : <><Shrink size={14} /> Reduzir (IA)</>}
        </button>
      </div>
    </div>

    <textarea 
      className="modern-textarea" 
      value={lyrics} 
      onChange={(e) => onLyricsChange(e.target.value)} 
      placeholder="Cole aqui a letra completa..."
    />

    <div className="stats-container">
      <div className="stat-pill"><List size={14} /> <span>Linhas: <strong>{stats.lines}</strong></span></div>
      <div className="stat-pill"><Hash size={14} /> <span>Palavras: <strong>{stats.words}</strong></span></div>
      <div className="stat-pill"><Repeat size={14} /> <span>Dups: <strong>{stats.duplicates}</strong></span></div>
    </div>
  </div>
);

const PresentationStation = ({ slides = [], currentSlide = 0, isPresenting, autoSlideSeconds, fontSize, bgImage, bgOpacity, onTogglePlay, onNext, onPrev, onFullscreen, onAutoSlideChange, onFontSizeChange, onImageUpload, onOpacityChange }) => {
  const slideText = slides[currentSlide] || "HOLYRICS\nEDITOR 2.0";
  return (
    <div className="config-column">
      <div className="presentation-header">
        <Play size={16} fill="#38bdf8" color="#38bdf8" /> ESTAÇÃO DE SLIDES
      </div>
      
      <div id="presentation-surface" className="slide-preview-surface">
        {bgImage && <div className="slide-bg" style={{ backgroundImage: `url(${bgImage})`, opacity: bgOpacity / 100 }} />}
        <div className="slide-text" style={{ fontSize: `${fontSize / 1.5}px` }}>{slideText}</div>
        <div className="slide-index">{currentSlide + 1} / {slides.length || 1}</div>
      </div>

      <div className="presentation-playback">
        <button onClick={onPrev} className="control-btn"><ChevronLeft size={20} /></button>
        <button onClick={onTogglePlay} className="control-btn primary">
          {isPresenting ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
        <button onClick={onNext} className="control-btn"><ChevronRight size={20} /></button>
        <button onClick={onFullscreen} className="control-btn"><Maximize size={18} /></button>
      </div>

      <div className="config-card">
        <div className="config-row">
          <div className="config-item">
            <label>Velocidade (s)</label>
            <input type="number" className="modern-input small" value={autoSlideSeconds} onChange={e => onAutoSlideChange(Number(e.target.value))} />
          </div>
          <div className="config-item">
            <label>Fonte: {fontSize}px</label>
            <input type="range" min="20" max="100" value={fontSize} onChange={e => onFontSizeChange(Number(e.target.value))} className="modern-range" />
          </div>
        </div>
        <div className="config-row" style={{ marginTop: 12 }}>
          <div className="config-item">
            <label className="upload-label">
              <ImageIcon size={14} /> {bgImage ? 'Alterar Fundo' : 'Subir Imagem'}
              <input type="file" onChange={onImageUpload} style={{ display: 'none' }} accept="image/*" />
            </label>
          </div>
          <div className="config-item">
            <label>Opacidade: {bgOpacity}%</label>
            <input type="range" min="0" max="100" value={bgOpacity} onChange={e => onOpacityChange(Number(e.target.value))} className="modern-range" />
          </div>
        </div>
      </div>
    </div>
  );
};

// --- App Principal ---

function App() {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [slides, setSlides] = useState([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const [folders, setFolders] = useState([{ id: 'f1', name: 'Minhas Letras', type: 'folder', isExpanded: true, children: [] }])
  const [selectedFileId, setSelectedFileId] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [bgOpacity, setBgOpacity] = useState(50)
  const [fontSize, setFontSize] = useState(50)
  const [autoSlideSeconds, setAutoSlideSeconds] = useState(4)
  const [isPresenting, setIsPresenting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState('')

  // Monitorar Mudanças na Letra -> Gerar Slides
  useEffect(() => {
    if (!lyrics) { setSlides([]); return; }
    const parts = lyrics.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    setSlides(parts);
    if (currentSlide >= parts.length) setCurrentSlide(0);
  }, [lyrics]);

  // Controle de Apresentação Automática
  useEffect(() => {
    if (!isPresenting || slides.length === 0) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % slides.length);
    }, autoSlideSeconds * 1000);
    return () => clearInterval(interval);
  }, [isPresenting, slides.length, autoSlideSeconds]);

  // Handlers de Sidebar
  const handleToggleFolder = (id) => {
    setFolders(prev => {
      const update = (list) => list.map(n => {
        if (n.id === id) return { ...n, isExpanded: !n.isExpanded };
        if (n.children) return { ...n, children: update(n.children) };
        return n;
      });
      return update(prev);
    });
  };

  const handleNewFile = () => {
    const name = prompt('Nome da Música:');
    if (!name) return;
    const newFile = { id: Date.now(), name: name.endsWith('.txt') ? name : `${name}.txt`, type: 'file' };
    setFolders(prev => {
      const n = [...prev];
      if (n[0].children) n[0].children.push(newFile);
      else n[0].children = [newFile];
      return [...n];
    });
  };

  const handleSelectFile = useCallback((node) => {
    setSelectedFileId(node.id);
    if (node.file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setLyrics(e.target.result);
        setTitle(node.name.replace('.txt', ''));
      };
      reader.readAsText(node.file);
    } else {
      setTitle(node.name.replace('.txt', ''));
    }
  }, []);

  const handleImportFolder = (files) => {
    console.log("Arquivos recebidos:", files.length);
    const txtFiles = files.filter(f => f.name.toLowerCase().endsWith('.txt'));
    
    if (txtFiles.length === 0) {
      alert("Nenhum arquivo .txt encontrado nesta pasta. Verifique se as músicas estão em formato de texto comum.");
      return;
    }

    const buildTree = (fileList) => {
      const root = [];
      fileList.forEach(file => {
        const path = file.webkitRelativePath || file.name;
        const parts = path.split('/');
        let currentLevel = root;
        
        parts.forEach((part, index) => {
          const isFile = index === parts.length - 1;
          let existing = currentLevel.find(item => item.name === part);
          
          if (!existing) {
            existing = {
              id: Math.random().toString(36).substr(2, 9),
              name: part,
              type: isFile ? 'file' : 'folder',
              isExpanded: true,
              children: isFile ? null : [],
              file: isFile ? file : null
            };
            currentLevel.push(existing);
          }
          currentLevel = existing.children || [];
        });
      });
      return root;
    };

    const newTree = buildTree(txtFiles);
    
    setFolders(prev => {
      // Tentar mesclar a primeira pasta se já existir uma com o mesmo nome
      const updated = [...prev];
      newTree.forEach(newNode => {
        const existingNode = updated.find(n => n.name === newNode.name && n.type === 'folder');
        if (existingNode) {
          existingNode.children = [...(existingNode.children || []), ...(newNode.children || [])];
        } else {
          updated.push(newNode);
        }
      });
      return updated;
    });

    setMessage(`${txtFiles.length} músicas carregadas com sucesso!`);
    setTimeout(() => setMessage(''), 4000);
  };

  // Central de Exportação
  const exportar = async (formato) => {
    setIsProcessing(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      const baseName = `${normalizeName(title)}_${date}`;
      const zip = new JSZip();

      // Funções auxiliares de conteúdo
      const getJSON = () => JSON.stringify({ title, artist, lyrics, slides, created: date }, null, 2);
      const getTXT = () => `${title.toUpperCase()}\n${artist}\n\n${lyrics}`;

      if (formato === 'zip') {
        zip.file(`${baseName}.mufl`, getJSON());
        zip.file(`${baseName}.hbac`, getJSON());
        zip.file(`${baseName}.txt`, getTXT());
        zip.file(`${baseName}.pptx`, "Simulação de PowerPoint"); // Placeholder
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `${baseName}.zip`);
      } else {
        const content = formato === 'txt' ? getTXT() : getJSON();
        const blob = new Blob([content], { type: "text/plain" });
        saveAs(blob, `${baseName}.${formato}`);
      }
      setMessage(`Exportado com sucesso: ${formato.toUpperCase()}`);
      setTimeout(() => setMessage(''), 4000);
    } catch (e) {
      alert("Erro na exportação.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Inteligência de Estatísticas
  const stats = useMemo(() => {
    if (!lyrics) return { lines: 0, words: 0, duplicates: 0 };
    const rawLines = lyrics.split('\n').filter(l => l.trim().length > 0);
    const wordsCount = lyrics.split(/\s+/).filter(w => w.trim().length > 0).length;
    const duplicates = rawLines.filter((l, i) => rawLines.indexOf(l.trim().toLowerCase()) !== i).length;
    return { lines: rawLines.length, words: wordsCount, duplicates };
  }, [lyrics]);

  return (
    <div className="app-container">
      <Sidebar 
        folders={folders} 
        onToggleFolder={handleToggleFolder} 
        onSelectFile={handleSelectFile}
        onImportFolder={handleImportFolder}
        onNewFile={handleNewFile}
        onNewFolder={() => setFolders(p => [...p, { id: Date.now(), name: 'Nova Pasta', type: 'folder', isExpanded: true, children: [] }])}
        selectedFileId={selectedFileId}
      />

      <main className="main-content-scroll">
        <h1 className="main-logo-text">HOLYRICS <span>EDITOR 2.0</span></h1>
        
        <LyricEditor 
          title={title} artist={artist} lyrics={lyrics} 
          onTitleChange={setTitle} onArtistChange={setArtist} onLyricsChange={setLyrics}
          onAutoEdit={() => setLyrics(lyrics.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n'))}
          onShorten={() => alert('IA configurada mas aguardando chave de API.')}
          isProcessing={isProcessing}
          stats={stats}
        />

        {message && <div className="floating-msg">{message}</div>}
      </main>

      <aside className="right-panel">
        <PresentationStation 
          slides={slides} currentSlide={currentSlide} isPresenting={isPresenting}
          autoSlideSeconds={autoSlideSeconds} fontSize={fontSize} bgImage={imagePreview} bgOpacity={bgOpacity}
          onTogglePlay={() => setIsPresenting(!isPresenting)}
          onNext={() => setCurrentSlide(p => (p+1) % (slides.length || 1))}
          onPrev={() => setCurrentSlide(p => (p-1+slides.length) % (slides.length || 1))}
          onFullscreen={() => document.getElementById('presentation-surface')?.requestFullscreen()}
          onAutoSlideChange={setAutoSlideSeconds} onFontSizeChange={setFontSize}
          onImageUpload={e => setImagePreview(URL.createObjectURL(e.target.files[0]))}
          onOpacityChange={setBgOpacity}
        />

        <div className="export-hub">
          <div className="hub-header"><Download size={16} /> CENTRAL DE EXPORTAÇÃO</div>
          <div className="hub-grid">
            <button onClick={() => exportar('mufl')} className="hub-btn mufl">MUFL</button>
            <button onClick={() => exportar('hbac')} className="hub-btn hbac">HBAC</button>
            <button onClick={() => exportar('ppt')} className="hub-btn ppt">PPTX</button>
            <button onClick={() => exportar('txt')} className="hub-btn txt">TXT</button>
          </div>
          <button onClick={() => exportar('zip')} className="hub-btn full zip"><Archive size={14} /> PACOTE ZIP COMPLETO</button>
        </div>
      </aside>
    </div>
  )
}

export default App
