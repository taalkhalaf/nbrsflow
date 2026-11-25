import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Unexpected UI error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[nbrsflow] React ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const isAr = document.documentElement.lang === 'ar';
    return (
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="flex h-screen w-screen items-center justify-center bg-bg p-6 text-fg"
      >
        <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 text-center shadow-2xl">
          <h1 className="text-base font-semibold text-fg">
            {isAr ? 'تعذّر عرض الواجهة مؤقتاً' : 'Interface Recovery'}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {isAr
              ? 'حدث خطأ غير متوقع أثناء رسم الواجهة. يمكنك إعادة تحميل النافذة الآن بأمان.'
              : 'An unexpected rendering error occurred. You can safely reload the window now.'}
          </p>
          {this.state.message && (
            <div dir="ltr" className="mt-3 rounded-lg border border-line bg-bg px-3 py-2 text-[11px] text-silver break-words">
              {this.state.message}
            </div>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accentfg hover:opacity-90"
          >
            {isAr ? 'إعادة تحميل الواجهة' : 'Reload Interface'}
          </button>
        </div>
      </div>
    );
  }
}
