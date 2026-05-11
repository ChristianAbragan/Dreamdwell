import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { persistAssistantChat, persistRecentContext, readAssistantChat } from '../utils/dreamdwellContext';

const initialMessage = {
  role: 'assistant',
  content: "Hi, I'm Archi. Ask me about your room, style, shopping list, or what to do next.",
};

const renameAssistant = (message) => ({
  ...message,
  content: `${message.content || ''}`.replace(/J\.A\.R\.V\.I\.S\./g, 'Archi'),
});

export default function FloatingAssistantChat({
  user,
  page = '/',
  scanContext = {},
  defaultOpen = false,
  compact = false,
  variant = 'floating',
}) {
  const docked = variant === 'docked';
  const userId = user?.uid || 'guest';
  const [open, setOpen] = useState(docked || defaultOpen);
  const [messages, setMessages] = useState(() => readAssistantChat([initialMessage], userId).map(renameAssistant));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (docked) setOpen(true);
  }, [docked]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    persistAssistantChat(messages, userId);
  }, [messages, userId]);

  useEffect(() => {
    setMessages(readAssistantChat([initialMessage], userId).map(renameAssistant));
  }, [userId]);

  const sendMessage = useCallback(async () => {
    const message = input.trim();
    if (!message || loading) return;

    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    persistRecentContext({ text: message, source: 'chat' }, userId);

    try {
      // Use accessToken from the user prop (already cached by AuthContext) —
      // getIdToken() can return null if Firebase hasn't settled yet.
      const endpoint = user?.accessToken ? '/api/rooms/room-chat' : '/api/public/public-chat';
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.accessToken ? { Authorization: `Bearer ${user.accessToken}` } : {}),
        },
        body: JSON.stringify({
          message,
          scanContext: {
            ...scanContext,
            systemState: {
              ...(scanContext.systemState || {}),
              page,
            },
          },
          userContext: {
            userName: user?.displayName || user?.email || 'Guest',
          },
        }),
      });

      const data = await response.json();
      const reply = data.reply || "I'm here, but I could not form a reply just now.";
      persistRecentContext({ text: reply, source: 'assistant' }, userId);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply },
      ]);
    } catch (_error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'I am having trouble connecting right now. Try again in a moment.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, page, scanContext, user, userId]);

  const chatCard = (
    <section
      className={docked ? undefined : 'glass-panel'}
      style={{
        width: docked ? '100%' : 'min(360px, calc(100vw - 32px))',
        height: docked ? 320 : 'auto',
        minHeight: docked ? 0 : 'auto',
        maxHeight: docked ? 'min(560px, 100%)' : 'min(520px, calc(100vh - 40px))',
        display: 'flex',
        flexDirection: 'column',
        alignSelf: docked ? 'center' : undefined,
        borderRadius: docked ? 0 : 16,
        overflow: 'hidden',
        boxShadow: docked ? 'none' : '0 18px 48px rgba(0,0,0,0.34)',
        border: docked ? 'none' : '1px solid rgba(135, 141, 150, 0.24)',
        background: docked ? 'transparent' : undefined,
      }}
    >
      <header
        style={{
          padding: docked ? '0 0 14px' : '12px 14px',
          background: docked ? 'transparent' : 'linear-gradient(135deg, #69717e, #9aa2ad)',
          color: docked ? 'var(--text)' : 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <strong style={{ display: 'block', fontSize: docked ? 16 : 14 }}>Archi</strong>
          <span style={{ fontSize: 11, opacity: 0.68 }}>
            {docked ? 'Ask a quick room question' : 'Continues your DreamDwell conversation'}
          </span>
        </div>
        {!docked && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.22)',
              background: 'rgba(0,0,0,0.12)',
              color: 'white',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            x
          </button>
        )}
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: docked ? '4px 0 12px' : 12,
          display: 'flex',
          flexDirection: 'column',
          gap: docked ? 10 : 8,
          background: docked ? 'transparent' : 'var(--bg-1)',
        }}
      >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              width: docked ? '100%' : undefined,
              maxWidth: docked ? '100%' : '86%',
              padding: docked ? 0 : '8px 11px',
              borderRadius: docked ? 0 : 14,
              background: docked
                ? 'transparent'
                : message.role === 'user'
                ? 'var(--accent)'
                : 'var(--surface)',
              color: docked
                ? message.role === 'user'
                  ? 'var(--accent)'
                  : 'var(--text)'
                : message.role === 'user'
                ? 'var(--bg-1)'
                : 'var(--text)',
              fontSize: 12,
              lineHeight: docked ? 1.6 : 1.45,
              textAlign: docked && message.role === 'user' ? 'right' : 'left',
              border: docked || message.role !== 'assistant' ? 'none' : '1px solid var(--glass-border)',
              boxShadow: 'none',
            }}
          >
            {docked && (
              <span
                style={{
                  display: 'block',
                  marginBottom: 2,
                  fontSize: 10,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                {message.role === 'user' ? 'You' : 'Archi'}
              </span>
            )}
            <span
              style={{
                display: 'block',
                maxWidth: docked ? 420 : undefined,
                marginLeft: docked && message.role === 'user' ? 'auto' : 0,
                marginRight: docked && message.role === 'assistant' ? 'auto' : 0,
              }}
            >
              {message.content}
            </span>
          </div>
        ))}
        {loading && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 2px' }}>
            Thinking...
          </span>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
        style={{
          display: 'flex',
          gap: 8,
          padding: docked ? '10px 0 0' : 10,
          borderTop: docked ? 'none' : '1px solid var(--glass-border)',
          background: docked ? 'transparent' : 'var(--surface)',
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about beds, colors, layout..."
          style={{
            flex: 1,
            minWidth: 0,
            border: '1px solid var(--glass-border)',
            borderRadius: 999,
            padding: '9px 12px',
            background: 'var(--bg-1)',
            color: 'var(--text)',
            outline: 'none',
            fontSize: 12,
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          style={{
            border: 'none',
            borderRadius: 999,
            background: 'var(--accent)',
            color: 'var(--bg-1)',
            padding: '0 14px',
            fontWeight: 700,
            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            opacity: input.trim() && !loading ? 1 : 0.6,
          }}
        >
          Send
        </button>
      </form>
    </section>
  );

  if (docked) return chatCard;

  return (
    <div
      style={{
        position: 'fixed',
        right: compact ? 16 : 20,
        bottom: compact ? 18 : 82,
        zIndex: 1500,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {open ? chatCard : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Archi chat"
          style={{
            width: 58,
            height: 58,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'linear-gradient(135deg, #69717e, #9aa2ad)',
            color: 'white',
            boxShadow: '0 8px 24px rgba(105,113,126,0.35)',
            cursor: 'pointer',
            fontSize: 24,
          }}
        >
          A
        </button>
      )}
    </div>
  );
}
