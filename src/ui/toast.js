/**
 * Toast — Notification system.
 *
 * Listens for bus 'toast' events and renders
 * slide-up notifications with auto-dismiss.
 *
 * Events consumed:
 *   toast  { msg, type }
 */
export class Toast {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     */
    constructor(bus) {
        this._bus = bus;
        this._container = document.getElementById('toast-container');
        bus.on('toast', ({ msg, type }) => this.show(msg, type));
    }

    show(msg, type = 'info') {
        if (type === 'error') {
            this._bus.emit('debug:error', { message: msg, source: 'toast' });
        }

        const el = document.createElement('div');
        const colors = {
            error: 'bg-red-950/90 border-red-500 text-red-200',
            success: 'bg-emerald-950/90 border-emerald-500 text-emerald-200',
            info: 'bg-slate-900/90 border-slate-600 text-slate-200'
        };
        const cls = colors[type] || colors.info;

        el.className = `${cls} border px-4 py-3 rounded shadow-2xl backdrop-blur-md transform transition-all duration-300 translate-y-10 opacity-0 pointer-events-auto min-w-[300px] max-w-md flex items-start gap-3`;

        const icon = document.createElement('div');
        icon.className = 'mt-0.5 font-bold text-lg';
        icon.textContent = type === 'error' ? '\u26A0' : (type === 'success' ? '\u2713' : '\u2139');

        const body = document.createElement('div');
        body.className = 'flex-1 text-[10px] font-mono break-words whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar';
        body.textContent = msg;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'text-white/50 hover:text-white';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => el.remove());

        el.append(icon, body, closeBtn);
        this._container.appendChild(el);

        // Trigger reflow then animate in
        el.offsetHeight;
        el.classList.remove('translate-y-10', 'opacity-0');

        setTimeout(() => {
            if (el.parentElement) {
                el.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => el.remove(), 300);
            }
        }, type === 'error' ? 8000 : 3000);
    }
}
