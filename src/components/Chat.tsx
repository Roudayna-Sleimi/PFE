import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { X, Send, MessageSquare } from 'lucide-react';
import './Chat.css';

interface Message {
  _id?: string;
  username: string;
  text: string;
  createdAt: string;
}

interface ChatProps {
  onClose: () => void;
}

const socket = io('http://localhost:5000', { transports: ['websocket'] });

const Chat: React.FC<ChatProps> = ({ onClose }) => {
  const username = localStorage.getItem('username') || 'Anonyme';
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Historique des messages
    socket.on('chat-history', (msgs: Message[]) => setMessages(msgs));

    // Nouveau message reçu
    socket.on('new-message', (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.off('chat-history');
      socket.off('new-message');
    };
  }, []);

  // Scroll automatique vers le bas
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(() => {
    if (!input.trim()) return;
    socket.emit('send-message', { username, text: input.trim() });
    setInput('');
  }, [input, username]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-overlay">
      <div className="chat-panel">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <MessageSquare size={18} />
            <span>Messagerie Interne</span>
            <span className="chat-online-badge">● En ligne</span>
          </div>
          <button className="chat-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">Aucun message pour le moment...</div>
          )}
          {messages.map((msg, index) => {
            const isMe = msg.username === username;
            return (
              <div key={msg._id || index} className={`chat-message ${isMe ? 'me' : 'other'}`}>
                {!isMe && <span className="chat-username">{msg.username}</span>}
                <div className="chat-bubble">
                  <span className="chat-text">{msg.text}</span>
                  <span className="chat-time">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <input
            type="text"
            className="chat-input"
            placeholder="Écrire un message..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="chat-send" onClick={sendMessage} disabled={!input.trim()}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;