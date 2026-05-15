import React, { useState } from 'react';
import { X, Trash2, Edit2, Copy, Check, UserMinus, Reply, Pin } from 'lucide-react';

interface ActionToolbarProps {
  selectedCount: number;
  onClose: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone?: () => void;
  onEdit?: () => void;
  onCopy: () => void;
  canEdit: boolean;
  canDeleteForEveryone: boolean;
  onReply?: () => void;
  onReact?: (emoji: string) => void;
  onPin?: () => void;
}

const ActionToolbar: React.FC<ActionToolbarProps> = ({
  selectedCount,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone,
  onEdit,
  onCopy,
  canEdit,
  canDeleteForEveryone,
  onReply,
  onReact,
  onPin
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="action-toolbar glass animate-slide-down" style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "70px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 1.5rem",
      background: "rgba(0, 0, 0, 0.2)",
      backdropFilter: "blur(25px)",
      borderBottom: "2px solid var(--primary)",
      zIndex: 2000,
      boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
    }}>
      <div className="toolbar-left" style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <button onClick={onClose} style={{ background: "transparent", color: "var(--text-main)", padding: "8px" }}>
          <X size={24} />
        </button>
        <span style={{ fontWeight: "bold", fontSize: "1.2rem", color: "var(--text-main)" }}>{selectedCount}</span>
      </div>
      
      <div className="toolbar-actions" style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
        {selectedCount === 1 && onReact && (
          <div style={{ display: 'flex', gap: '8px', marginRight: '8px', borderRight: '1px solid var(--border)', paddingRight: '16px' }}>
            <button onClick={() => { onReact('👍'); onClose(); }} style={{ background: "transparent", fontSize: "20px", border: "none", cursor: "pointer" }} title="Thumbs up">👍</button>
            <button onClick={() => { onReact('❤️'); onClose(); }} style={{ background: "transparent", fontSize: "20px", border: "none", cursor: "pointer" }} title="Heart">❤️</button>
            <button onClick={() => { onReact('😂'); onClose(); }} style={{ background: "transparent", fontSize: "20px", border: "none", cursor: "pointer" }} title="Laugh">😂</button>
            <button onClick={() => { onReact('🔥'); onClose(); }} style={{ background: "transparent", fontSize: "20px", border: "none", cursor: "pointer" }} title="Fire">🔥</button>
          </div>
        )}
        
        {canEdit && selectedCount === 1 && (
          <button onClick={onEdit} title="Edit" style={{ background: "transparent", color: "var(--text-main)" }}>
            <Edit2 size={20} />
          </button>
        )}
        
        {selectedCount === 1 && onReply && (
          <button onClick={onReply} title="Reply" style={{ background: "transparent", color: "var(--text-main)" }}>
            <Reply size={20} />
          </button>
        )}

        {selectedCount === 1 && onPin && (
          <button onClick={onPin} title="Pin Message" style={{ background: "transparent", color: "var(--text-main)" }}>
            <Pin size={20} />
          </button>
        )}
        
        <button onClick={handleCopy} title="Copy" style={{ background: "transparent", color: isCopied ? "var(--accent)" : "var(--text-main)" }}>
          {isCopied ? (
            <Check size={20} className="animate-tick" />
          ) : (
            <Copy size={20} />
          )}
        </button>

        <button onClick={onDeleteForMe} title="Delete for me" style={{ background: "transparent", color: "var(--text-main)" }}>
          <UserMinus size={20} />
        </button>

        {canDeleteForEveryone && (
          <button onClick={onDeleteForEveryone} title="Delete for everyone" style={{ background: "transparent", color: "var(--error)" }}>
            <Trash2 size={20} />
          </button>
        )}
      </div>

      <style>{`
        .animate-slide-down {
          animation: slideDown 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-tick {
          animation: tickPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes tickPop {
          0% { transform: scale(0); }
          70% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        .action-toolbar button {
          transition: transform 0.1s, opacity 0.2s;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .action-toolbar button:hover {
          transform: scale(1.1);
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
};

export default ActionToolbar;
