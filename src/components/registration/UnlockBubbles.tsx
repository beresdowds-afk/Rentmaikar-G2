import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, Sparkles } from 'lucide-react';
import type { RegistrationStage } from '@/hooks/useRegistrationProgress';

type Tile = { title: string; desc: string; href?: string };

/** Tiles that must never appear on a driver's dashboard. */
const DRIVER_HIDDEN_TILES = ['Earnings & payouts', 'Live fleet map', 'Rideshare uploads', 'Vehicle tracking'];

const STAGE_ORDER: RegistrationStage[] = [
  'auth',
  'account_opened',
  'documents_submitted',
  'verification_pending',
  'approved',
];

const STAGE_LABEL: Record<RegistrationStage, string> = {
  auth: 'Sign up',
  account_opened: 'Account opened',
  documents_submitted: 'Documents submitted',
  verification_pending: 'Identity verified',
  approved: 'Approved',
};

const DRIVER_UNLOCKS: Record<RegistrationStage, Tile[]> = {
  auth: [{ title: 'Profile & notifications', desc: 'Personalize your account.', href: '/profile/settings' }],
  account_opened: [
    { title: 'Dashboard preview', desc: 'Peek at what unlocks next.', href: '/driver/dashboard' },
    { title: 'Support chat', desc: 'Message admin any time.', href: '/driver/dashboard' },
  ],
  documents_submitted: [
    { title: 'Vehicle browsing', desc: 'Explore rentable vehicles.', href: '/driver/portal/browse' },
    { title: 'Rideshare uploads', desc: 'Submit weekly performance proof.', href: '/driver/portal/rideshare' },
  ],
  verification_pending: [
    { title: 'Payments & billing', desc: 'Weekly/daily payments and receipts.', href: '/driver/portal/payments' },
    { title: 'In-app voice calls', desc: 'Talk to admin securely.', href: '/driver/dashboard' },
  ],
  approved: [
    { title: 'Active rentals', desc: 'View agreement & assignment.', href: '/driver/dashboard' },
    { title: 'Vehicle tracking', desc: 'Live GPS & IoT telemetry.', href: '/driver/dashboard' },
    { title: 'Inspections', desc: 'File weekly photos & incidents.', href: '/driver/portal/inspection' },
  ],
};

const OWNER_UNLOCKS: Record<RegistrationStage, Tile[]> = {
  auth: [{ title: 'Profile & notifications', desc: 'Personalize your account.', href: '/profile/settings' }],
  account_opened: [
    { title: 'Dashboard preview', desc: 'Peek at what unlocks next.', href: '/owner/dashboard' },
    { title: 'Support chat', desc: 'Message admin any time.', href: '/owner/dashboard' },
  ],
  documents_submitted: [
    { title: 'Vehicle registrations', desc: 'Draft vehicle listings.', href: '/owner/portal/vehicles' },
    { title: 'Pickup location', desc: 'Configure pickup locations.', href: '/owner/portal/pickup' },
  ],
  verification_pending: [
    { title: 'IoT devices', desc: 'Purchase & manage trackers.', href: '/owner/portal/iot' },
    { title: 'Insurance & subscriptions', desc: 'Enroll in insurance/training.', href: '/owner/portal/insurance' },
  ],
  approved: [
    { title: 'Earnings & payouts', desc: 'Track weekly earnings & withdraw.', href: '/owner/portal/earnings' },
    { title: 'Weekly reports', desc: 'Review driver submissions.', href: '/owner/portal/inspections' },
    { title: 'Live fleet map', desc: 'See all your vehicles at once.', href: '/owner/dashboard' },
  ],
};

export function UnlockBubbles({
  role,
  stage,
  userId,
}: {
  role: 'driver' | 'owner';
  stage: RegistrationStage;
  userId?: string | null;
}) {
  const navigate = useNavigate();
  const baseMap = role === 'driver' ? DRIVER_UNLOCKS : OWNER_UNLOCKS;
  const map = (
    role === 'driver'
      ? (Object.fromEntries(
          Object.entries(baseMap).map(([k, tiles]) => [
            k,
            tiles.filter((t) => !DRIVER_HIDDEN_TILES.includes(t.title)),
          ]),
        ) as Record<RegistrationStage, Tile[]>)
      : baseMap
  );
  const currentIdx = Math.max(0, STAGE_ORDER.indexOf(stage));
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const storageKey = `unlock-bubbles:${role}:${userId ?? 'anon'}`;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    } catch { /* ignore */ }

    const toAnnounce = STAGE_ORDER.slice(0, currentIdx + 1).filter((s) => !seen.includes(s));
    toAnnounce.forEach((s, i) => {
      const tiles = map[s] ?? [];
      if (tiles.length === 0) return;
      setTimeout(() => {
        toast.success(`${STAGE_LABEL[s]} — unlocked!`, {
          description: tiles.map((t) => `• ${t.title}`).join('\n'),
          duration: 6000,
          icon: <Sparkles className="h-4 w-4" />,
        });
      }, 400 + i * 900);
    });
    try {
      localStorage.setItem(storageKey, JSON.stringify(STAGE_ORDER.slice(0, currentIdx + 1)));
    } catch { /* ignore */ }
  }, [role, stage, userId, currentIdx, map]);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">What you unlock at each stage</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Bubbles pop as you progress. Tap a locked bubble to see what it takes to unlock it.
      </p>
      <div className="space-y-4">
        {STAGE_ORDER.map((s, idx) => {
          const tiles = map[s] ?? [];
          if (tiles.length === 0) return null;
          const unlocked = idx <= currentIdx;
          return (
            <div key={s} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    unlocked
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Stage {idx + 1} · {STAGE_LABEL[s]}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {tiles.map((t, i) => (
                  <button
                    key={t.title}
                    type="button"
                    onClick={() => {
                      if (unlocked) {
                        toast.success(t.title, { description: t.desc, duration: 3000 });
                        if (t.href) navigate(t.href);
                      } else {
                        toast(t.title, {
                          description: `Unlocks at: ${STAGE_LABEL[s]}. ${t.desc}`,
                          icon: <Lock className="h-4 w-4" />,
                          duration: 4500,
                        });
                      }
                    }}
                    style={{ animationDelay: `${i * 60}ms` }}
                    className={`group animate-scale-in inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all hover-scale ${
                      unlocked
                        ? 'bg-primary/10 border-primary/40 text-foreground hover:bg-primary/15'
                        : 'bg-muted/40 border-muted-foreground/20 text-muted-foreground'
                    }`}
                    aria-label={`${t.title}${unlocked ? ' (unlocked)' : ' (locked)'}`}
                  >
                    {unlocked ? (
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    )}
                    <span className="font-medium">{t.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
