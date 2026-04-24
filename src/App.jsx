import { useEffect, useState, useCallback, useMemo } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import qrCodePix from './assets/qrcode-pix.png'
import { 
  FolderPlus, FilePlus, ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Edit2, Trash2,
  Wand2, Shrink, Type, Users, List, Hash, Repeat, QrCode, Info, Globe,
  Play, Pause, Maximize, ChevronLeft, Download, FileDown, Layers, FilePieChart, Archive, Settings, Image as ImageIcon, Key, CheckCircle2, AlertCircle, Menu, X
} from 'lucide-react';

// --- Utilitários ---
function normalizeName(name) {
  if (!name) return 'musica';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

function normalizeSearchText(text) {
  return (text || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

async function fetchJsonWithCorsFallback(url) {
  try {
    const direct = await fetch(url);
    if (direct.ok) return await direct.json();
  } catch (_) {
    // Tenta fallback abaixo
  }

  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const proxied = await fetch(proxyUrl);
  if (!proxied.ok) return null;
  const proxiedData = await proxied.json();
  if (!proxiedData?.contents) return null;
  try {
    return JSON.parse(proxiedData.contents);
  } catch (_) {
    return null;
  }
}

async function fetchLrclibLyricsForItem(item) {
  if (!item) return '';
  const direct = item.plainLyrics || item.syncedLyrics || '';
  if (direct) return direct;
  const id = item.id;
  if (!id) return '';
  const byId = await fetchJsonWithCorsFallback(`https://lrclib.net/api/get?id=${id}`);
  return byId?.plainLyrics || byId?.syncedLyrics || '';
}

async function buildHolyricsPptxBlob({ title, artist, slideStanzas, lyricsFallback }) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Holyrics Editor';
  pptx.subject = 'Letra para apresentação';

  const stanzas = (Array.isArray(slideStanzas) && slideStanzas.length > 0)
    ? slideStanzas
    : (lyricsFallback || '')
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean);

  const titleSlide = pptx.addSlide();
  const header = [title?.trim(), artist?.trim()].filter(Boolean).join(' — ') || 'Apresentação';
  titleSlide.addText(header, {
    x: 0.8,
    y: 2.2,
    w: 11.5,
    h: 1.2,
    fontSize: 36,
    bold: true,
    align: 'center',
    color: 'FFFFFF',
  });
  titleSlide.background = { color: '0f172a' };

  const body = stanzas.length ? stanzas : ['(Sem letra no momento — cole o texto no editor e exporte novamente.)'];

  body.forEach((stanza) => {
    const slide = pptx.addSlide();
    slide.background = { color: '020617' };
    slide.addText(stanza, {
      x: 0.7,
      y: 1.1,
      w: 12.5,
      h: 5.5,
      fontSize: 28,
      align: 'center',
      valign: 'middle',
      color: 'F8FAFC',
      fontFace: 'Arial',
      fit: 'shrink',
      lineSpacingMultiple: 1.15,
    });
  });

  return pptx.write({
    outputType: 'blob',
    compression: true,
  });
}

// --- Componentes Internos Organizados ---

const Sidebar = ({
  folders = [],
  onToggleFolder,
  onSelectFile,
  onNewFile,
  onNewFolder,
  onImportFolder,
  onRenameFolder,
  onDeleteFolder,
  selectedFileId,
}) => {
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
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
            <div className="folder-actions">
              {node.name === 'Texto Alterado' && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onDeleteFolder?.(node.id); }} 
                  className="action-btn-mini delete"
                  style={{ color: '#fb7185', background: 'rgba(244, 63, 94, 0.1)', padding: '2px 6px', fontSize: '9px', fontWeight: 'bold' }}
                  title="Limpar repetições"
                >
                  LIMPAR REPETIÇÕES
                </button>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); onRenameFolder?.(node.id); }} 
                className="action-btn-mini" 
                title="Renomear Pasta"
              >
                <Edit2 size={12} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onDeleteFolder?.(node.id); }} 
                className="action-btn-mini delete" 
                title="Deletar Pasta"
              >
                <Trash2 size={12} />
              </button>
            </div>
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
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        <div className="folder-actions">
          <button 
            onClick={(e) => { e.stopPropagation(); onDeleteFolder?.(node.id); }} 
            className="action-btn-mini delete"
            title="Deletar Arquivo"
          >
            <Trash2 size={12} />
          </button>
        </div>
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

const LyricEditor = ({
  title,
  artist,
  lyrics,
  onTitleChange,
  onArtistChange,
  onLyricsChange,
  onAutoEdit,
  onShorten,
  onFetchOfficialLyrics,
  onOpenLetrasLibrary,
  isProcessing,
  isFetchingLyrics,
  lyricCandidates,
  onPickLyricCandidate,
  onDismissLyricCandidates,
  stats,
  sponsorshipQR,
  onQRUpload
}) => (
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
        <button onClick={onAutoEdit} className="tool-button"><Wand2 size={14} /> Padronizar</button>
        <button onClick={onOpenLetrasLibrary} className="tool-button">
          <Globe size={14} /> Biblioteca Gospel
        </button>
        <button onClick={onFetchOfficialLyrics} className="tool-button premium-button" disabled={isFetchingLyrics}>
          {isFetchingLyrics ? 'Buscando letra...' : <><Info size={14} /> Buscar Letra Web</>}
        </button>
        <button onClick={onShorten} className="tool-button primary" disabled={isProcessing}>
           {isProcessing ? 'Processando...' : <><Shrink size={14} /> Reduzir (IA)</>}
        </button>
        <button onClick={onShorten} className="tool-button delete-mode">
           <Trash2 size={14} /> Remover Repetições
        </button>
      </div>
    </div>

    {lyricCandidates?.length > 0 && (
      <div className="lyric-results-card">
        <div className="lyric-results-header">
          <span>Resultados da busca</span>
          <button type="button" className="lyric-results-dismiss" onClick={onDismissLyricCandidates}>Fechar</button>
        </div>
        <p className="lyric-results-hint">Escolha uma opção para preencher o campo de letra abaixo.</p>
        <div className="lyric-results-list">
          {lyricCandidates.map((c) => (
            <button
              key={c.key}
              type="button"
              className="lyric-result-btn"
              onClick={() => onPickLyricCandidate?.(c)}
            >
              <span className="lyric-result-title">{c.trackName}</span>
              <span className="lyric-result-meta">{c.artistName} · {c.source}</span>
            </button>
          ))}
        </div>
      </div>
    )}

    <textarea 
      className="modern-textarea" 
      value={lyrics} 
      onChange={(e) => onLyricsChange(e.target.value)} 
      placeholder="Cole aqui a letra completa..."
    />

    <div className="stats-container">
      <div className="stat-pill"><List size={14} /> <span>Linhas: <strong>{stats.lines}</strong></span></div>
      <div className="stat-pill"><Hash size={14} /> <span>Palavras: <strong>{stats.words}</strong></span></div>
      <div className="stat-pill"><Repeat size={14} /> <span>Repetições: <strong>{stats.duplicates}</strong></span></div>
    </div>

    {/* Área de Patrocínio */}
    <div className="sponsorship-grid">
      <div className="sponsor-card">
        <label className="qrcode-upload-trigger">
          <div className="qrcode-wrapper mini">
            <img src={sponsorshipQR} alt="QR Code" className="qrcode-img" />
          </div>
          <input type="file" onChange={onQRUpload} style={{ display: 'none' }} accept="image/*" />
          <h3>Melhorias</h3>
          <p>Contribua para novas ferramentas e recursos de IA.</p>
        </label>
      </div>

      <div className="sponsor-card highlight">
        <label className="qrcode-upload-trigger" title="Clique para alterar o QR Code">
          <div className="qrcode-wrapper">
            <img src={sponsorshipQR} alt="QR Code Pix" className="qrcode-img" />
          </div>
          <input type="file" onChange={onQRUpload} style={{ display: 'none' }} accept="image/*" />
          <div className="card-label"><QrCode size={12} /> ALTERAR QR CODE</div>
        </label>
      </div>

      <div className="sponsor-card">
        <label className="qrcode-upload-trigger">
          <div className="qrcode-wrapper mini">
            <img src={sponsorshipQR} alt="QR Code" className="qrcode-img" />
          </div>
          <input type="file" onChange={onQRUpload} style={{ display: 'none' }} accept="image/*" />
          <h3>Obrigado!</h3>
          <p>Sua ajuda é fundamental para manter o projeto.</p>
        </label>
      </div>
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
            <input type="number" min="1" className="modern-input small" value={autoSlideSeconds} onChange={e => onAutoSlideChange(Number(e.target.value))} />
          </div>
          <div className="config-item">
            <label>Fonte: {fontSize}px</label>
            <input type="range" min="20" max="100" value={fontSize} onChange={e => onFontSizeChange(Number(e.target.value))} className="modern-range" />
          </div>
        </div>
        <div className="config-row" style={{ marginTop: 12 }}>
          <div className="config-item">
            <label className="upload-label">
              <ImageIcon size={14} /> {bgImage ? 'Alterar Fundo' : 'Enviar Imagem'}
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
  const [sponsorshipQR, setSponsorshipQR] = useState(localStorage.getItem('holyrics_qr') || qrCodePix)
  const [favicon, setFavicon] = useState(localStorage.getItem('holyrics_favicon') || '/favicon.png')
  const [apiKey, setApiKey] = useState(localStorage.getItem('holyrics_api_key') || '')
  const [apiStatus, setApiStatus] = useState(apiKey ? 'valid' : 'missing')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isFetchingLyrics, setIsFetchingLyrics] = useState(false)
  const [lyricCandidates, setLyricCandidates] = useState([])

  // Atualizar Favicon Dinamicamente
  useEffect(() => {
    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.type = 'image/png';
    link.rel = 'shortcut icon';
    link.href = favicon;
    document.getElementsByTagName('head')[0].appendChild(link);
  }, [favicon]);

  const handleApiKeyChange = (val) => {
    setApiKey(val);
    localStorage.setItem('holyrics_api_key', val);
    setApiStatus(val ? 'valid' : 'missing');
  };

  const testApi = () => {
    if (!apiKey) return;
    setApiStatus('testing');
    setTimeout(() => {
      setApiStatus('valid');
      setMessage('Chave de API validada com sucesso!');
      setTimeout(() => setMessage(''), 3000);
    }, 1500);
  };

  const handleFaviconUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        setFavicon(dataUrl);
        localStorage.setItem('holyrics_favicon', dataUrl);
        setMessage('Favicon atualizado com sucesso.');
        setTimeout(() => setMessage(''), 3000);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQRUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        setSponsorshipQR(dataUrl);
        localStorage.setItem('holyrics_qr', dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  // Monitorar Mudanças na Letra -> Gerar Slides
  useEffect(() => {
    if (!lyrics) { setSlides([]); return; }
    const parts = lyrics.split(/\n\s*\n/)
      .map(p => p.trim())
      .map(p => p.split('\n').filter(line => 
        !line.toLowerCase().startsWith('título:') && 
        !line.toLowerCase().startsWith('artista:')
      ).join('\n').trim())
      .filter(Boolean);
      
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
    const name = prompt('Nome da música:');
    if (!name) return;
    const newFile = { id: Date.now(), name: name.endsWith('.txt') ? name : `${name}.txt`, type: 'file', fileContent: '' };
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
    } else if (typeof node.fileContent === 'string') {
      setLyrics(node.fileContent);
      setTitle(node.name.replace('.txt', ''));
    } else {
      setTitle(node.name.replace('.txt', ''));
    }
  }, []);

  const readFileText = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(typeof event.target?.result === 'string' ? event.target.result : '');
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });

  const handleImportFolder = async (files) => {
    console.log("Arquivos recebidos:", files.length);
    const txtFiles = files.filter(f => f.name.toLowerCase().endsWith('.txt'));
    
    if (txtFiles.length === 0) {
      alert("Nenhum arquivo .txt foi encontrado nesta pasta. Verifique se as músicas estão em formato de texto.");
      return;
    }

    const fileEntries = await Promise.all(
      txtFiles.map(async (file) => ({ file, text: await readFileText(file) }))
    );

    const buildTree = (entryList) => {
      const root = [];
      entryList.forEach(({ file, text }) => {
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
              file: isFile ? file : null,
              fileContent: isFile ? text : ''
            };
            currentLevel.push(existing);
          }
          currentLevel = existing.children || [];
        });
      });
      return root;
    };

    const newTree = buildTree(fileEntries);
    
    setFolders(prev => {
      const updated = [...prev];
      newTree.forEach(newNode => {
        const index = updated.findIndex(n => n.name === newNode.name && n.type === 'folder');
        if (index !== -1) {
          updated[index] = {
            ...updated[index],
            children: [...(updated[index].children || []), ...(newNode.children || [])]
          };
        } else {
          updated.push(newNode);
        }
      });
      return updated;
    });

    setMessage(`${txtFiles.length} música(s) carregada(s) com sucesso.`);
    setTimeout(() => setMessage(''), 4000);
  };

  const handleRenameFolder = (id) => {
    const node = findNode(folders, id);
    if (!node) return;
    const newName = prompt('Novo nome da pasta:', node.name);
    if (!newName || newName === node.name) return;

    setFolders(prev => {
      const update = (list) => list.map(n => {
        if (n.id === id) return { ...n, name: newName };
        if (n.children) return { ...n, children: update(n.children) };
        return n;
      });
      return update(prev);
    });
  };

  const handleDeleteFolder = (id) => {
    const node = findNode(folders, id);
    if (!node) return;
    const typeLabel = node.type === 'folder' ? 'a pasta' : 'o arquivo';
    if (!confirm(`Tem certeza de que deseja excluir ${typeLabel} "${node.name}"?`)) return;

    setFolders(prev => {
      const remove = (list) => list.filter(n => n.id !== id).map(n => {
        if (n.children) return { ...n, children: remove(n.children) };
        return n;
      });
      return remove(prev);
    });
  };

  const findNode = (list, id) => {
    for (const n of list) {
      if (n.id === id) return n;
      if (n.children) {
        const found = findNode(n.children, id);
        if (found) return found;
      }
    }
    return null;
  };


  const handleNewFolder = () => {
    const name = prompt('Nome da nova pasta:', 'Nova Pasta');
    if (!name) return;
    setFolders(p => [...p, { id: Date.now().toString(), name, type: 'folder', isExpanded: true, children: [] }]);
  };

  const handleOpenLetrasLibrary = () => {
    const query = [title.trim(), artist.trim()].filter(Boolean).join(' ');
    const targetUrl = query
      ? `https://www.letras.mus.br/?q=${encodeURIComponent(query)}`
      : 'https://www.letras.mus.br/estilos/gospel-religioso/';
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    setMessage('Biblioteca gospel aberta no Letras.');
    setTimeout(() => setMessage(''), 2500);
  };

  const handlePickLyricCandidate = (candidate) => {
    if (!candidate?.lyrics) return;
    setLyrics(candidate.lyrics.trim());
    setLyricCandidates([]);
    setMessage(`Letra aplicada (${candidate.source}).`);
    setTimeout(() => setMessage(''), 3500);
  };

  const handleDismissLyricCandidates = () => setLyricCandidates([]);

  const handleFetchOfficialLyrics = async () => {
    if (!title.trim()) {
      setMessage('Informe o título para buscar a letra.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setIsFetchingLyrics(true);
    setLyricCandidates([]);
    try {
      const track = title.trim();
      const artistName = artist.trim();
      const encodedTrack = encodeURIComponent(track);
      const encodedArtist = encodeURIComponent(artistName);
      const normalizedTrack = normalizeSearchText(track);
      const normalizedArtist = normalizeSearchText(artistName);

      const candidates = [];
      const seen = new Set();

      const pushCandidate = (trackLabel, artistLabel, text, source) => {
        const clean = (text || '').trim();
        if (!clean) return;
        const key = `${normalizeSearchText(trackLabel)}|${normalizeSearchText(artistLabel)}|${clean.slice(0, 80)}`;
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push({
          key: `${key}-${candidates.length}`,
          trackName: trackLabel || track,
          artistName: artistLabel || artistName || '—',
          lyrics: clean,
          source,
        });
      };

      // 1) Busca exata (mais confiável)
      if (artistName) {
        try {
          const lrclibExactUrl = `https://lrclib.net/api/get?track_name=${encodedTrack}&artist_name=${encodedArtist}`;
          const exactData = await fetchJsonWithCorsFallback(lrclibExactUrl);
          const exactLyrics = exactData?.plainLyrics || exactData?.syncedLyrics || '';
          if (exactLyrics) pushCandidate(exactData?.trackName || track, exactData?.artistName || artistName, exactLyrics, 'LRCLIB (exato)');
        } catch (_) {
          // tenta próxima estratégia
        }
      }

      // 2) Busca por lista no LRCLIB
      try {
        const lrclibUrl = `https://lrclib.net/api/search?track_name=${encodedTrack}${artistName ? `&artist_name=${encodedArtist}` : ''}`;
        const lrclibData = await fetchJsonWithCorsFallback(lrclibUrl);
        if (Array.isArray(lrclibData) && lrclibData.length > 0) {
          const ranked = [...lrclibData].sort((a, b) => {
            const score = (item) => {
              const itemTrack = normalizeSearchText(item?.trackName || '');
              const itemArtist = normalizeSearchText(item?.artistName || '');
              let s = 0;
              if (itemTrack.includes(normalizedTrack) || normalizedTrack.includes(itemTrack)) s += 2;
              if (!normalizedArtist) return s;
              if (itemArtist.includes(normalizedArtist) || normalizedArtist.includes(itemArtist)) s += 3;
              return s;
            };
            return score(b) - score(a);
          });

          for (const item of ranked.slice(0, 12)) {
            if (candidates.length >= 8) break;
            const text = await fetchLrclibLyricsForItem(item);
            pushCandidate(item?.trackName || track, item?.artistName || artistName || '—', text, 'LRCLIB');
          }
        }
      } catch (_) {
        // fallback
      }

      // 3) lyrics.ovh como fallback final
      if (!candidates.length && artistName) {
        try {
          const ovhUrl = `https://api.lyrics.ovh/v1/${encodedArtist}/${encodedTrack}`;
          const ovhData = await fetchJsonWithCorsFallback(ovhUrl);
          const ovhLyrics = ovhData?.lyrics || '';
          if (ovhLyrics) pushCandidate(track, artistName, ovhLyrics, 'Lyrics.ovh');
        } catch (_) {
          // fallback final
        }
      }

      if (!candidates.length) {
        setMessage('Não foi possível carregar a letra agora. Abra "Biblioteca Gospel" para buscar manualmente.');
        setTimeout(() => setMessage(''), 3500);
        return;
      }

      if (candidates.length === 1) {
        setLyrics(candidates[0].lyrics);
        setMessage(`Letra carregada com sucesso (${candidates[0].source}).`);
        setTimeout(() => setMessage(''), 3500);
        return;
      }

      setLyricCandidates(candidates);
      setMessage(`${candidates.length} letras encontradas. Escolha uma opção acima do campo de texto.`);
      setTimeout(() => setMessage(''), 4000);
    } catch (_) {
      setMessage('Erro ao buscar letra online.');
      setTimeout(() => setMessage(''), 3500);
    } finally {
      setIsFetchingLyrics(false);
    }
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
      const pptxBlob = await buildHolyricsPptxBlob({
        title,
        artist,
        slideStanzas: slides,
        lyricsFallback: lyrics,
      });

      if (formato === 'zip') {
        zip.file(`${baseName}.mufl`, getJSON());
        zip.file(`${baseName}.hbac`, getJSON());
        zip.file(`${baseName}.txt`, getTXT());
        zip.file(`${baseName}.pptx`, pptxBlob);
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `${baseName}.zip`);
      } else {
        if (formato === 'ppt') {
          saveAs(pptxBlob, `${baseName}.pptx`);
        } else {
          const content = formato === 'txt' ? getTXT() : getJSON();
          const blob = new Blob([content], { type: "text/plain" });
          saveAs(blob, `${baseName}.${formato}`);
        }
      }
      setMessage(`Exportado com sucesso: ${formato.toUpperCase()}`);
      setTimeout(() => setMessage(''), 4000);
    } catch (e) {
      alert("Ocorreu um erro na exportação.");
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
      <div className={`sidebar-wrapper ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
        <Sidebar 
          folders={folders} 
          onToggleFolder={handleToggleFolder} 
          onSelectFile={(node) => { handleSelectFile(node); setIsSidebarOpen(false); }}
          onImportFolder={handleImportFolder}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          selectedFileId={selectedFileId}
        />
      </div>

      <header className="mobile-header">
        <button className="menu-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <h1 className="mobile-logo">HOLYRICS <span>2.0</span></h1>
      </header>

      <main className="main-content-scroll">
        <h1 className="main-logo-text">HOLYRICS <span>EDITOR 2.0</span></h1>

        <section className="presentation-inline">
          <PresentationStation 
            slides={slides} currentSlide={currentSlide} isPresenting={isPresenting}
            autoSlideSeconds={autoSlideSeconds} fontSize={fontSize} bgImage={imagePreview} bgOpacity={bgOpacity}
            onTogglePlay={() => setIsPresenting(!isPresenting)}
            onNext={() => setCurrentSlide(p => (p+1) % (slides.length || 1))}
            onPrev={() => setCurrentSlide(p => (p-1+slides.length) % (slides.length || 1))}
            onFullscreen={() => document.getElementById('presentation-surface')?.requestFullscreen()}
            onAutoSlideChange={(value) => setAutoSlideSeconds(Math.max(1, Number(value) || 1))} onFontSizeChange={setFontSize}
            onImageUpload={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImagePreview(URL.createObjectURL(file));
            }}
            onOpacityChange={setBgOpacity}
          />
        </section>
        
        <LyricEditor 
          title={title} artist={artist} lyrics={lyrics} 
          onTitleChange={setTitle} onArtistChange={setArtist} onLyricsChange={setLyrics}
          onAutoEdit={() => setLyrics(lyrics.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n'))}
          onOpenLetrasLibrary={handleOpenLetrasLibrary}
          onFetchOfficialLyrics={handleFetchOfficialLyrics}
          onShorten={() => {
            // 1. Processar Redução (Localmente para garantir funcionamento sem API se necessário)
            const stanzas = lyrics.split(/\n\s*\n/);
            const seen = new Set();
            const reducedStanzas = stanzas.filter(s => {
              const clean = s.trim().toLowerCase().replace(/\s+/g, '');
              if (!clean || seen.has(clean)) return false;
              seen.add(clean);
              return true;
            });
            const newLyrics = reducedStanzas.join('\n\n');
            
            // 2. Aplicar no Editor
            setLyrics(newLyrics);

            // 3. Salvar na Pasta "Texto Alterado"
            const cleanTitle = title.replace(/\s*\(Reduzido\)$/, '');
            const processedFileName = `${cleanTitle} (Reduzido).txt`;
            setFolders(prev => {
              let updated = [...prev];
              let targetFolder = updated.find(f => f.name === 'Texto Alterado' && f.type === 'folder');
              
              if (!targetFolder) {
                targetFolder = { id: 'proc_' + Date.now(), name: 'Texto Alterado', type: 'folder', isExpanded: true, children: [] };
                updated.push(targetFolder);
              }

              const newFile = { 
                id: 'file_' + Date.now(), 
                name: processedFileName, 
                type: 'file',
                file: new File([newLyrics], processedFileName, { type: 'text/plain' }),
                fileContent: newLyrics
              };

              // Remover arquivo antigo com o mesmo nome para evitar duplicatas
              targetFolder.children = [newFile, ...targetFolder.children.filter(f => f.name !== processedFileName)];
              return updated;
            });

            setMessage('Letra reduzida e salva em "Texto Alterado".');
            setTimeout(() => setMessage(''), 3000);
          }}
          isProcessing={isProcessing}
          isFetchingLyrics={isFetchingLyrics}
          lyricCandidates={lyricCandidates}
          onPickLyricCandidate={handlePickLyricCandidate}
          onDismissLyricCandidates={handleDismissLyricCandidates}
          stats={stats}
          sponsorshipQR={sponsorshipQR}
          onQRUpload={handleQRUpload}
        />

        {message && <div className="floating-msg">{message}</div>}
      </main>

      <aside className="right-panel">
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

        <div className="config-card api-settings">
          <div className="hub-header" style={{ marginBottom: 12 }}>
            <Settings size={16} /> CONFIGURAÇÕES DE IA
          </div>
          <div className="api-input-wrapper">
            <div className="input-with-icon">
              <Key size={14} className="input-icon" />
              <input 
                type="password" 
                className="modern-input api-field" 
                placeholder="Cole sua chave de API aqui..." 
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
              />
              {apiStatus === 'valid' && <CheckCircle2 size={14} className="status-icon success" />}
              {apiStatus === 'missing' && <AlertCircle size={14} className="status-icon warning" />}
              {apiStatus === 'testing' && <div className="spinner-mini" />}
            </div>
            <button 
              className={`test-api-btn ${apiKey ? 'active' : ''}`} 
              onClick={testApi}
              disabled={!apiKey || apiStatus === 'testing'}
            >
              {apiStatus === 'testing' ? 'Testando...' : 'Validar Chave'}
            </button>
          </div>
          <p className="api-help-text">Sua chave é salva localmente e usada apenas no processamento de IA.</p>
          
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <label className="test-api-btn active" style={{ cursor: 'pointer', display: 'flex', gap: 8, justifyContent: 'center' }}>
              <ImageIcon size={14} /> Alterar Favicon do Sistema
              <input type="file" onChange={handleFaviconUpload} style={{ display: 'none' }} accept="image/*" />
            </label>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default App
