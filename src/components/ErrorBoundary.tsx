import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Bannerlord Tarzı React Hata Yakalayıcı (ErrorBoundary).
 * Render veya yaşam döngüsündeki beklenmeyen istisnaların tüm ekranı
 * beyazlatmasını önler; kullanıcıya kurtarma ve yeniden yükleme seçenekleri sunar.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Kadirlord ErrorBoundary] Beklenmeyen hata yakalandı:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleRecover = () => {
    try {
      if (this.props.onReset) {
        this.props.onReset();
      }
    } catch (e) {
      console.error('[Kadirlord ErrorBoundary] Kurtarma sırasında ikincil hata:', e);
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || 'Bilinmeyen çalışma zamanı hatası';
      const stackPreview = this.state.error?.stack
        ? this.state.error.stack.split('\n').slice(0, 4).join('\n')
        : null;

      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0a0806] text-[#e5d8c3] select-none"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="error-title"
        >
          <div className="w-full max-w-lg bg-[#14100c] border border-[#c6a15b]/60 rounded-sm shadow-2xl p-6 sm:p-8 flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-[#c6a15b]/25 pb-4">
              <span className="text-3xl">🛡️</span>
              <div>
                <h1 id="error-title" className="text-lg font-bold font-display tracking-wider text-[#fde68a]">
                  SANCAK-I KALRADYA: BİR HATA OLUŞTU
                </h1>
                <p className="text-xs text-[#a89b84] mt-0.5">
                  Arayüz beklenmeyen bir durumla karşılaştı fakat sefer kaydınız korunuyor.
                </p>
              </div>
            </div>

            {/* Error Details */}
            <div className="bg-[#0b0907] border border-red-950/60 rounded p-3 text-xs font-mono text-red-300/90 break-words max-h-36 overflow-y-auto">
              <div className="font-semibold text-red-400 mb-1">Hata: {errorMessage}</div>
              {stackPreview && <div className="text-[10px] text-stone-500 whitespace-pre-wrap">{stackPreview}</div>}
            </div>

            {/* Recovery Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleRecover}
                className="flex-1 py-3 px-4 bg-[#785826] hover:bg-[#926c30] active:bg-[#5e441c] text-[#fef9c3] font-semibold text-xs tracking-wider uppercase border border-[#c6a15b]/70 rounded-xs shadow transition-colors cursor-pointer"
              >
                ⚔️ Seferi Kurtar (Yeniden Dene)
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="py-3 px-4 bg-[#1e1710] hover:bg-[#2b2118] text-[#c6a15b] font-semibold text-xs tracking-wider uppercase border border-[#c6a15b]/30 rounded-xs transition-colors cursor-pointer"
              >
                🔄 Sayfayı Yenile
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
