export default function TecnicoLoading() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--page-bg, #0f0f0f)',
    }}>
      <div style={{
        width: 36, height: 36,
        border: '4px solid rgba(245,197,24,0.2)',
        borderTopColor: '#F5C518',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
