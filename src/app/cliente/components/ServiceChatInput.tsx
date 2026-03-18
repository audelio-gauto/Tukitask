"use client";
import React, { useRef, useState, useEffect } from "react";

interface ServiceChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: (val: string | Blob) => void;
  audioUrl?: string | null;
  onAudioDelete?: () => void;
  disabled?: boolean;
}

export default function ServiceChatInput({
  value,
  onChange,
  onSend,
  audioUrl,
  onAudioDelete,
  disabled,
}: ServiceChatInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showCancel, setShowCancel] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [inputRows, setInputRows] = useState(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const holdStart = useRef<number>(0);
  const [dragX, setDragX] = useState(0);

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      setMediaRecorder(mr);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudioBlob(blob);
        setIsRecording(false);
        setShowCancel(false);
        setDragX(0);
      };
      mr.start();
      setIsRecording(true);
      setAudioBlob(null);
    } catch (e) {
      alert("No se pudo acceder al micrófono");
    }
  };

  const stopRecording = (cancel = false) => {
    if (mediaRecorder) {
      // Al soltar, simplemente detenemos y guardamos el audio (a menos que sea cancelado por deslizar)
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
      setIsRecording(false);
      setShowCancel(false);
      setDragX(0);
      if (cancel) setAudioBlob(null);
    }
  };

  // Touch/Mouse handlers for hold-to-record
  const handleMicDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    holdStart.current = Date.now();
    setShowCancel(false);
    setDragX(0);
    startRecording();
    // Solo grabar mientras se mantiene presionado
    document.addEventListener("mousemove", handleDrag);
    document.addEventListener("touchmove", handleDrag);
    document.addEventListener("mouseup", handleMicUp, { once: true });
    document.addEventListener("touchend", handleMicUp, { once: true });
  };

  const handleDrag = (e: MouseEvent | TouchEvent) => {
    let clientX = 0;
    if (e instanceof TouchEvent) {
      clientX = e.touches[0].clientX;
    } else {
      clientX = e.clientX;
    }
    setDragX(clientX);
    if (clientX < 100) setShowCancel(true);
    else setShowCancel(false);
  };

  const handleMicUp = () => {
    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("touchmove", handleDrag);
    // Al soltar, si no se deslizó a cancelar, guardar el audio
    if (showCancel) stopRecording(true);
    else stopRecording(false);
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
              placeholder="Escribe un mensaje"
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
      {isRecording && showCancel && (
        <div className="service-chat-cancel">Cancelar ❌</div>
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
