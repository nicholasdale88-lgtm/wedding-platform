import type { InvitationContent } from '@wp/shared';
import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { albumApi } from '../../lib/api';
import { isDemo } from '../../try/demo';
import { useAdmin } from '../Shell';
import { useToast } from '../ui';
import { Extra, ExtrasGrid } from './ExtrasGrid';
import { Grid, Section, TextField } from './fields';

type Thanks = NonNullable<InvitationContent['thanks']>;

/**
 * Setup → Thank-you page: what guests open after the day (from the "Thank you for coming" text). Their words
 * first, then the photo, the photos when they're ready, and how it's sent. Laid out like the invitation.
 */
export function ThanksEditor({ inv, setInv, Photo }: { inv: InvitationContent; setInv: (p: Partial<InvitationContent>) => void; Photo: ComponentType<{ value: string; onChange: (v: string) => void }> }) {
  // This editor's own steps, numbered from 1 in reading order each time it draws.
  let k = 0;
  const n = () => ++k;
  const { wid, path } = useAdmin();
  const toast = useToast();
  const t: Thanks = inv.thanks ?? {};
  const set = (patch: Partial<Thanks>) => setInv({ thanks: { ...t, ...patch } });
  const photo = String(inv.images?.thanks ?? '');
  const [album, setAlbum] = useState<boolean | null>(null);
  // The gallery link as typed: saved once it's a whole https:// link (or cleared).
  const [gallery, setGallery] = useState(t.gallery ?? '');
  useEffect(() => {
    if (isDemo()) return;
    albumApi
      .get(wid)
      .then((r) => setAlbum(r.on))
      .catch(() => setAlbum(null));
  }, [wid]);
  const share = async (on: boolean) => {
    try {
      setAlbum((await albumApi.set(wid, on)).on);
      toast(on ? 'Guests can see everyone’s photos' : 'The shared album is closed');
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <>
      <Section n={n()} title="Your thank-you" hint="What every guest reads after the day, in your colours. Leave any box empty for our wording.">
        <Grid>
          <TextField label="Heading" value={t.heading ?? ''} placeholder="Thank you" onChange={(heading) => set({ heading })} />
          <TextField label="Signed" value={t.signoff ?? ''} placeholder="With love, the two of you" onChange={(signoff) => set({ signoff })} />
        </Grid>
        <TextField
          label="Your message"
          long
          value={t.message ?? ''}
          placeholder="Thank you for celebrating with us. Having you there made our day, and we’ll remember it always."
          onChange={(message) => set({ message })}
          hint="Each guest sees “Dear (their names)” above it."
        />
      </Section>
      <Section n={n()} title="Extras" hint="Each card shows what’s set now. Tap one to change it.">
        <ExtrasGrid>
          <Extra title="Your photo" now={photo ? 'Photo added' : 'No photo yet'}>
            <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">A favourite from the day, above your message.</span>
            <Photo value={photo} onChange={(v) => setInv({ images: { ...(inv.images ?? {}), thanks: v } })} />
          </Extra>
          <Extra title="Photos ready" now={t.ready ? 'Ready: guests see the photo buttons' : 'Not yet'}>
            <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">When your photos come back, switch this on: the page shows guests a button to them. Until then it says they’re on their way.</span>
            <label className="flex items-center gap-3 text-[15px] cursor-pointer min-h-[44px]">
              <input type="checkbox" role="switch" checked={!!t.ready} onChange={(e) => set({ ready: e.target.checked })} className="w-[20px] h-[20px] accent-[#5d6b47]" />
              Our photos are ready
            </label>
            <TextField
              label="Your photographer’s gallery (optional)"
              value={gallery}
              placeholder="https://…"
              onChange={(v) => {
                setGallery(v);
                const link = v.trim();
                if (!link || /^https:\/\/\S+\.\S+$/.test(link)) set({ gallery: link });
              }}
              hint="The link they sent you. Must start with https://"
            />
            {album !== null && (
              <label className="flex items-center gap-3 text-[15px] cursor-pointer min-h-[44px]">
                <input type="checkbox" role="switch" checked={album} onChange={(e) => void share(e.target.checked)} className="w-[20px] h-[20px] accent-[#5d6b47]" />
                Share everyone’s photos in one album (the photos guests added)
              </label>
            )}
          </Extra>
          <Extra title="Sending it" now="With your “Thank you for coming” text">
            <span className="text-[14px]">
              Your “Thank you for coming” text links each guest to this page with <code className="px-1 rounded bg-[var(--adm-tint,#efe7d3)]">{'{thanks}'}</code>. It goes the day after unless you change it. Send it again once the photos are ready, so everyone sees them.
            </span>
            <Link to={path('texts')} className="self-start py-2 px-4 rounded-full border border-[var(--adm-ink,#33402f)] text-[14px] no-underline !text-[var(--adm-ink,#33402f)]">
              Open your texts
            </Link>
          </Extra>
        </ExtrasGrid>
      </Section>
    </>
  );
}
