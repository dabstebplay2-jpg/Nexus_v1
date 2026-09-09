import React, { useState } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown } from 'lucide-react';

const FileTreeNode = ({ node, onFileSelect, activeFilePath }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  if (!node.is_dir) {
    const isActive = node.path === activeFilePath;
    return (
      <div 
        onClick={() => onFileSelect(node.path)}
        className={`flex items-center gap-2 py-1 px-3 cursor-pointer text-sm transition-colors duration-150 rounded ${
          isActive ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
        }`}
      >
        <File size={15} className="text-blue-400 shrink-0" />
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <div 
        onClick={handleToggle}
        className="flex items-center gap-1 py-1 px-2 hover:bg-neutral-900 cursor-pointer text-neutral-300 hover:text-white rounded text-sm transition-colors duration-150"
      >
        <span className="text-neutral-500 shrink-0">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="shrink-0 mr-1">
          {isOpen ? (
            <FolderOpen size={16} className="text-yellow-500" />
          ) : (
            <Folder size={16} className="text-yellow-500" />
          )}
        </span>
        <span className="truncate font-medium">{node.name}</span>
      </div>
      {isOpen && node.children && (
        <div className="pl-3 border-l border-neutral-800 ml-3.5 mt-0.5 space-y-0.5">
          {node.children.map((child, index) => (
            <FileTreeNode 
              key={index} 
              node={child} 
              onFileSelect={onFileSelect} 
              activeFilePath={activeFilePath} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FileTreeNode;