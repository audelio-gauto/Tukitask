"use client";
import React, { useRef, useState, useEffect } from "react";

interface ServiceChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: (val: string | Blob) => void;
  audioUrl?: string | null;
  onAudioDelete?: () => void;
  disabled?: boolean;
  isSimpleInput?: boolean;
  placeholder?: string;
}

export default function ServiceChatInput({
  value,
  onChange,
  onSend,
  audioUrl,
  onAudioDelete,
  disabled,
  isSimpleInput = false,
  placeholder = "Escribe un mensaje...",
}: ServiceChatInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [inputRows, setInputRows] = useState(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for recording — avoids stale closures in event handlers
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);

  // Handle input auto-grow
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.rows = 1;
      const rows = Math.min(4, Math.ceil(inputRef.current.scrollHeight / 24));
      setInputRows(rows);
      inputRef.current.rows = rows;
    }
  }, [value]);

  // Recording logic
  useEffect(() => {
    if (!isRecording) return;
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime((t) => t + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    if (disabled) return;
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      recorderRef.current = mr;
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        // Release the mic immediately
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (cancelledRef.current) {
          setAudioBlob(null);
        } else {
          const blob = new Blob(chunks, { type: "audio/webm" });
          setAudioBlob(blob);
        }
        setIsRecording(false);
      };
      mr.start();
      setIsRecording(true);
      setAudioBlob(null);
    } catch {
      alert("No se pudo acceder al micrófono");
    }
  };

  const stopRecording = (cancel = false) => {
    cancelledRef.current = cancel;
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stop(); // triggers onstop which cleans up
    } else {
      // If recorder never started, just clean up
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);
    }
  };

  // Touch/Mouse handlers for hold-to-record (WhatsApp style)
  const handleMicDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault(); // prevent ghost clicks
    startRecording();
    const onUp = () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
      stopRecording(false);
    };
    document.addEventListener("mouseup", onUp, { once: true });
    document.addEventListener("touchend", onUp, { once: true });
  };

  // Send text or audio
  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob);
      setAudioBlob(null);
    } else if (value.trim()) {
      onSend(value.trim());
      onChange("");
    }
  };

  // Audio preview UI
  const renderAudioPreview = () => {
    if (!audioBlob && !audioUrl) return null;
    const url = audioUrl || (audioBlob ? URL.createObjectURL(audioBlob) : "");
    return (
      <div className="service-audio-preview">
        <audio controls src={url} style={{ width: 120 }} />
        <span className="service-audio-duration">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}</span>
        {onAudioDelete && (
          <button className="service-audio-delete" onClick={onAudioDelete} type="button" aria-label="Borrar audio">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
        <button className="service-audio-send" onClick={handleSend} type="button" aria-label="Enviar audio">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </button>
      </div>
    );
  };

  if (isSimpleInput) {
    return (
      <div className="si-wrapper">
        {/* Audio preview after recording */}
        {(audioBlob || audioUrl) && (
          <div className="si-audio-preview">
            <audio controls src={audioUrl || (audioBlob ? URL.createObjectURL(audioBlob) : "")} />
            <button
              className="si-audio-delete"
              type="button"
              aria-label="Borrar audio"
              onClick={() => {
                setAudioBlob(null);
                if (onAudioDelete) onAudioDelete();
              }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        {/* Main input row */}
        {!(audioBlob || audioUrl) && (
          <div className={`si-input-row${isRecording ? ' recording' : ''}`}>
            {isRecording ? (
              <div className="si-recording-indicator">
                <span className="si-rec-dot" />
                <span className="si-rec-timer">
                  {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                </span>
                <span className="si-rec-label">Grabando...</span>
              </div>
            ) : (
              <textarea
                ref={inputRef}
                className="si-textarea"
                placeholder={placeholder}
                value={value}
                onChange={e => onChange(e.target.value)}
                rows={inputRows}
                maxLength={500}
                disabled={disabled}
              />
            )}
            <button
              className={`si-mic-btn${isRecording ? ' active' : ''}`}
              type="button"
              aria-label="Grabar audio"
              onMouseDown={handleMicDown}
              onTouchStart={handleMicDown}
              disabled={disabled}
            >
              {isRecording ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="service-chat-input-bar">
      <div style={{ width: '100%' }}>
        {/* Audio preview SIEMPRE visible si hay audio grabado */}
        {(audioBlob || audioUrl) && (
          <div className="service-audio-preview" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', background: '#f3f4f6', borderRadius: 16, padding: '8px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <audio controls src={audioUrl || (audioBlob ? URL.createObjectURL(audioBlob) : "")} style={{ width: 120 }} />
            <span className="service-audio-duration" style={{ marginLeft: 8, color: '#374151', fontSize: '0.95rem' }}>{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}</span>
            {onAudioDelete && (
              <button className="service-audio-delete" onClick={onAudioDelete} type="button" aria-label="Borrar audio" style={{ background: 'none', border: 'none', marginLeft: 8, color: '#ef4444', fontSize: '1.2rem', cursor: 'pointer' }}>
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        )}
        {/* Input y mic/enviar solo si NO hay audio pendiente */}
        {!(audioBlob || audioUrl) && (
          <div className="service-chat-input-pill" style={{ display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '6px 12px', width: '100%', minHeight: 48 }}>
            {/* Input */}
            <textarea
              ref={inputRef}
              className="service-chat-textarea"
              placeholder={placeholder}
              value={value}
              onChange={e => onChange(e.target.value)}
              rows={inputRows}
              maxLength={500}
              disabled={disabled || isRecording}
              style={{ resize: "none", border: 'none', outline: 'none', background: 'transparent', fontSize: '1rem', flex: 1, minHeight: 28, padding: 0 }}
            />
            {/* Mic o enviar */}
            {value.trim() ? (
              <button className="service-chat-send-btn" type="button" onClick={handleSend} aria-label="Enviar" style={{ background: 'none', border: 'none', marginLeft: 6, fontSize: 22, color: '#2563eb', cursor: 'pointer' }}>
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </button>
            ) : (
              <button
                className={`service-chat-mic-btn${isRecording ? " recording" : ""}`}
                type="button"
                aria-label="Grabar audio"
                onMouseDown={handleMicDown}
                onTouchStart={handleMicDown}
                style={isRecording ? { background: "#ef4444", animation: "pulse 1s infinite", marginLeft: 6 } : { marginLeft: 6, background: 'none', border: 'none', fontSize: 22, color: '#222', cursor: 'pointer' }}
                disabled={disabled}
              >
                {isRecording ? (
                  <span style={{ color: "#fff", fontWeight: 700 }}>{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}</span>
                ) : (
                  <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" strokeWidth={2} /><rect x="10" y="8" width="4" height="8" rx="2" fill="#6b7280" /></svg>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// CSS sugerido (agrega en tu global.css o módulo):
/*
.service-chat-input-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  box-shadow: 0 -2px 16px rgba(0,0,0,0.06);
  padding: 12px 8px 20px 8px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.service-chat-input-pill {
  display: flex;
  align-items: flex-end;
  background: #f3f4f6;
  border-radius: 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  padding: 8px 12px;
  width: 100%;
  max-width: 480px;
}
.service-chat-textarea {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 1rem;
  min-height: 32px;
  max-height: 120px;
  margin-right: 8px;
  padding: 0;
  resize: none;
}
.service-chat-mic-btn, .service-chat-send-btn {
  background: #e5e7eb;
  border: none;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  margin-left: 4px;
  transition: background 0.2s, transform 0.1s;
}
.service-chat-mic-btn.recording {
  background: #ef4444;
  color: #fff;
  animation: pulse 1s infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 #ef444488; }
  70% { box-shadow: 0 0 0 10px #ef444400; }
  100% { box-shadow: 0 0 0 0 #ef444400; }
}
.service-chat-cancel {
  color: #ef4444;
  font-weight: 700;
  margin-top: 8px;
  font-size: 1.1rem;
}
.service-audio-preview {
  display: flex;
  align-items: center;
  background: #f3f4f6;
  border-radius: 16px;
  padding: 8px 12px;
  margin-bottom: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.service-audio-duration {
  margin-left: 8px;
  color: #374151;
  font-size: 0.95rem;
}
.service-audio-delete, .service-audio-send {
  background: none;
  border: none;
  margin-left: 8px;
  color: #ef4444;
  font-size: 1.2rem;
  cursor: pointer;
}
.service-audio-send {
  color: #2563eb;
}
*/
