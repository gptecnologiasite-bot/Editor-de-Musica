import React from 'react';
import { FolderPlus, FilePlus, ChevronRight, ChevronDown, FileText, Folder, Edit2, Trash2 } from 'lucide-react';

const Sidebar = ({ folders = [], onToggleFolder, onSelectFile, onNewFile, onNewFolder, onRenameFolder, onDeleteFolder, selectedFileId }) => {
  const renderTreeNode = (node, depth = 0) => {
    if (!node) return null;
    const isSelected = selectedFileId === node.id;
    const paddingLeft = depth * 16 + 12;

    if (node.type === 'folder') {
      return (
        <div key={node.id}>
          <div
            onClick={() => onToggleFolder?.(node.id)}
            style={{
              padding: `8px 12px 8px ${paddingLeft}px`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              color: node.isExpanded ? '#f8fafc' : '#94a3b8',
              background: 'transparent',
              transition: 'all 0.2s',
              fontSize: 14,
              fontWeight: 500,
            }}
            className="sidebar-item"
          >
            {node.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Folder size={16} color="#38bdf8" fill={node.isExpanded ? "#38bdf8" : "none"} opacity={0.8} />
            <span style={{ flex: 1 }}>{node.name}</span>
            <div className="folder-actions" style={{ display: 'flex', gap: 4 }}>
              {node.name === 'Texto Alterado' && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onDeleteFolder?.(node.id); }} 
                  style={{ 
                    background: 'rgba(244, 63, 94, 0.1)', 
                    border: '1px solid rgba(244, 63, 94, 0.2)', 
                    color: '#fb7185', 
                    cursor: 'pointer', 
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                  title="Deletar Todos os Repetidos"
                >
                  <Trash2 size={10} /> DELETAR REPETIDOS
                </button>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); onRenameFolder?.(node.id); }} 
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                title="Renomear Pasta"
              >
                <Edit2 size={12} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onDeleteFolder?.(node.id); }} 
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                title="Deletar Pasta"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {node.isExpanded && node.children && Array.isArray(node.children) && (
            <div className="folder-children">
              {node.children.map(child => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.id}
        onClick={() => onSelectFile?.(node)}
        style={{
          padding: `8px 12px 8px ${paddingLeft + 24}px`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          color: isSelected ? '#38bdf8' : '#cbd5e1',
          background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
          borderLeft: isSelected ? '2px solid #38bdf8' : '2px solid transparent',
          transition: 'all 0.2s',
          fontSize: 13,
        }}
        className="sidebar-item"
      >
        <FileText size={14} opacity={0.7} />
        <span style={{ 
          flex: 1, 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap' 
        }}>{node.name}</span>
        <div className="folder-actions" style={{ opacity: 1 }}>
          <button 
            onClick={(e) => { e.stopPropagation(); onDeleteFolder?.(node.id); }} 
            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, display: 'flex' }}
            title="Deletar Arquivo"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Explorador</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button 
            onClick={onNewFile}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
            title="Novo Arquivo"
          >
            <FilePlus size={16} />
          </button>
          <button 
            onClick={onNewFolder}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
            title="Nova Pasta"
          >
            <FolderPlus size={16} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {!folders || folders.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            Carregando arquivos...
          </div>
        ) : (
          folders.map(node => renderTreeNode(node))
        )}
      </div>
    </div>
  );
};

export default Sidebar;
