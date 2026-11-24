import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export interface WebAgendaAlert {
  kind: 'booking' | 'tour';
  folio: string;
  title: string;
  subtitle: string;
}

const pendingCount = ref(0);
const lastAlert = ref<WebAgendaAlert | null>(null);
let unsubBookings: Unsubscribe | null = null;
let unsubTours: Unsubscribe | null = null;
let started = false;
let alertTimer: ReturnType<typeof setTimeout> | null = null;

function chime(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1046.5;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    osc.onended = () => void ctx.close();
  } catch {
    /* autoplay bloqueado */
  }
}

function showBrowserPush(alert: WebAgendaAlert): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    try {
      const n = new Notification(alert.title, {
        body: alert.subtitle,
        icon: '/favicon.svg',
        tag: `cowhub-${alert.kind}-${alert.folio}`,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* navegador sin soporte de Notification constructor */
    }
  }
}

export function useWebAgendaAlerts() {
  const { db } = useFirebase();

  function requestPermissionIfNeeded(): void {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function trigger(alert: WebAgendaAlert): void {
    lastAlert.value = alert;
    chime();
    showBrowserPush(alert);
    if (alertTimer) clearTimeout(alertTimer);
    alertTimer = setTimeout(() => {
      lastAlert.value = null;
    }, 10000);
  }

  function start(): void {
    if (started || !db || !import.meta.client) return;
    started = true;
    requestPermissionIfNeeded();

    let bookingsReady = false;
    let toursReady = false;
    const seenBookings = new Set<string>();
    const seenTours = new Set<string>();
    let bCount = 0;
    let tCount = 0;

    unsubBookings = onSnapshot(
      query(collection(db, 'space_bookings'), where('status', '==', 'pending')),
      (snap) => {
        bCount = snap.size;
        pendingCount.value = bCount + tCount;
        for (const d of snap.docs) {
          if (bookingsReady && !seenBookings.has(d.id)) {
            const b = d.data();
            const folio = String(b.folio ?? d.id);
            const who = String(b.guests?.name ?? 'Cliente');
            const space = String(b.space_name ?? 'Espacio');
            trigger({
              kind: 'booking',
              folio,
              title: `Nueva reserva por confirmar (${folio})`,
              subtitle: `${who} · ${space} · ${b.date ?? ''}`,
            });
          }
          seenBookings.add(d.id);
        }
        bookingsReady = true;
      },
    );

    unsubTours = onSnapshot(
      query(collection(db, 'tour_requests'), where('status', '==', 'new')),
      (snap) => {
        tCount = snap.size;
        pendingCount.value = bCount + tCount;
        for (const d of snap.docs) {
          if (toursReady && !seenTours.has(d.id)) {
            const t = d.data();
            const folio = String(t.folio ?? d.id);
            const who = String(t.name ?? 'Visitante');
            trigger({
              kind: 'tour',
              folio,
              title: `Nueva solicitud de tour (${folio})`,
              subtitle: `${who}${t.company ? ` · ${t.company}` : ''}${t.preferred_date ? ` · ${t.preferred_date}` : ''}`,
            });
          }
          seenTours.add(d.id);
        }
        toursReady = true;
      },
    );
  }

  function dismissAlert(): void {
    lastAlert.value = null;
    if (alertTimer) clearTimeout(alertTimer);
  }

  return {
    pendingCount: readonly(pendingCount),
    lastAlert: readonly(lastAlert),
    start,
    dismissAlert,
  };
}
