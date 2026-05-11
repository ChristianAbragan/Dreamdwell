import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config/api';

export default function DreamAIChat({
  scanResult = null,
  userContext = null,
  onMessagesChange,
  onSuggestionRevision,
}) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      text: "I'm Archi. Ask about the scan, remove or add a suggestion, or change the palette.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  const sendMessage = useCallback(async (text) => {
    const cleanText = text.trim();
    if (!cleanText || isLoading) return;

    const userMsg = { id: Date.now(), role: 'user', text: cleanText, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const localRevisionNote = onSuggestionRevision?.(cleanText);

    try {
      const response = await fetch(`${API_BASE_URL}/api/public/public-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${cleanText}\n\nKeep your answer under 90 words unless I ask for detail.`,
          scanContext: scanResult || {},
          userContext: userContext || {},
        }),
      });

      if (!response.ok) throw new Error('Chat request failed');
      const data = await response.json();
      const reply = localRevisionNote
        ? `${localRevisionNote} ${data.reply || ''}`.trim()
        : data.reply || 'Got it. What would you like to adjust next?';

      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'assistant', text: reply, timestamp: Date.now() },
      ]);
    } catch (_error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: 'I could not reach the AI server right now. Check that the backend is running.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, onSuggestionRevision, scanResult, userContext]);

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage(input);
  };

  const toggleMic = useCallback(() => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      setInput(finalTranscript + interim);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => {
      setIsListening(false);
      if (finalTranscript.trim()) sendMessage(finalTranscript.trim());
    };

    setIsListening(true);
    recognition.start();
  }, [sendMessage]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 10px', borderBottom: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
          <strong style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>Archi</strong>
        </div>
        <span style={{ fontSize: '0.68rem', color: isListening ? '#c24141' : 'var(--text-muted)' }}>
          {isListening ? 'Listening' : 'Room assistant'}
        </span>
      </header>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '10px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {messages.slice(-5).map((message) => (
          <div key={message.id} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'stretch', maxWidth: message.role === 'user' ? '86%' : '100%' }}>
            <div
              style={{
                padding: message.role === 'user' ? '8px 11px' : '0 2px',
                borderRadius: message.role === 'user' ? 12 : 0,
                background: message.role === 'user' ? 'var(--accent)' : 'transparent',
                color: message.role === 'user' ? 'var(--bg-1)' : 'var(--text)',
                fontSize: '0.8rem',
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: message.role === 'assistant' ? 5 : 'unset',
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {message.text}
            </div>
          </div>
        ))}
        {isLoading && <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Archi is thinking...</span>}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--glass-border)' }}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask, add, remove, or recolor..."
          disabled={isLoading}
          style={{
            flex: 1,
            minWidth: 0,
            border: '1px solid var(--glass-border)',
            borderRadius: 999,
            background: 'var(--bg-1)',
            color: 'var(--text)',
            outline: 'none',
            fontSize: '0.78rem',
            padding: '8px 11px',
          }}
        />
        <button type="button" onClick={toggleMic} title="Voice input" style={iconButtonStyle}>Mic</button>
        <button type="submit" disabled={!input.trim() || isLoading} style={{ ...iconButtonStyle, background: 'var(--accent)', color: 'var(--bg-1)', opacity: input.trim() && !isLoading ? 1 : 0.55 }}>
          Send
        </button>
      </form>
    </section>
  );
}

const iconButtonStyle = {
  border: '1px solid var(--glass-border)',
  borderRadius: 999,
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: '0 12px',
  fontSize: '0.74rem',
  cursor: 'pointer',
};
