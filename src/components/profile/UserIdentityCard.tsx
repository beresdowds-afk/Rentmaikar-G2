import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Camera, Copy, Loader2, Check, Trash2, RefreshCw, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

/**
 * Normalises a stored avatar reference to a bucket-relative storage path.
 * Accepts both the current form (bare path) and legacy public URLs.
 */
function storagePathOf(stored: string): string | null {
  const clean = stored.split('?')[0];
  if (!/^https?:\/\//.test(clean)) return clean.replace(/^\/+/, '') || null;
  return extractStoragePath(clean, 'profile-photos');
}
import {
  validatePassportFile,
  squareCropToBlob,
  extractStoragePath,
} from '@/lib/passport-image';
import { Link } from 'react-router-dom';
import { trackOnboardingEvent } from '@/lib/onboarding-analytics';

interface Props {
  role?: 'Driver' | 'Owner';
  /** Hide the "Manage profile" link (e.g. when already on the profile page). */
  hideSettingsLink?: boolean;
}

export function UserIdentityCard({ role, hideSettingsLink }: Props) {
  const { user } = useAuth();
  const [fullName, setFullName] = useState<string>('');
  const [publicUuid, setPublicUuid] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Passport pictures live in a PRIVATE bucket. `profiles.avatar_url` stores
  // the storage path; the displayable URL is a short-lived signed URL that we
  // mint on render. Legacy rows may still hold a full public URL — the
  // extractor normalises both shapes.
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, public_uuid, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setFullName(data.full_name || user.user_metadata?.full_name || '');
        setPublicUuid((data as any).public_uuid || '');
        setAvatarUrl(data.avatar_url || null);
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!avatarUrl) { setDisplayUrl(null); return; }
      const path = storagePathOf(avatarUrl);
      if (!path) { setDisplayUrl(null); return; }
      const { data } = await supabase.storage
        .from('profile-photos')
        .createSignedUrl(path, 60 * 60);
      if (!cancelled) setDisplayUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [avatarUrl]);


  const initials = (fullName || user?.email || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const v = await validatePassportFile(file);
    if (!v.ok) {
      toast({ title: 'Invalid photo', description: v.error, variant: 'destructive' });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    try {
      const blob = await squareCropToBlob(file);
      setPendingBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewOpen(true);
    } catch (err: any) {
      toast({ title: 'Could not process image', description: err.message, variant: 'destructive' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingBlob(null);
  };

  const confirmUpload = async () => {
    if (!pendingBlob || !user?.id) return;
    setUploading(true);
    try {
      // Remove any previous passport picture in the user's folder first so
      // the bucket stays tidy and we don't accumulate orphaned files.
      await deleteExistingAvatar();

      const path = `${user.id}/passport-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('profile-photos')
        .upload(path, pendingBlob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      // Store the private storage path; a signed URL is minted on render.
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ avatar_url: path })
        .eq('user_id', user.id);
      if (updErr) throw updErr;
      const hadPrevious = !!avatarUrl;
      setAvatarUrl(path);
      trackOnboardingEvent(hadPrevious ? 'passport_replaced' : 'passport_uploaded', {
        extra: { size_bytes: pendingBlob.size },
      });
      toast({ title: 'Passport picture updated' });
      closePreview();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const deleteExistingAvatar = async () => {
    if (!avatarUrl) return;
    const path = storagePathOf(avatarUrl);
    if (!path) return;
    try {
      await supabase.storage.from('profile-photos').remove([path]);
    } catch {
      /* best-effort */
    }
  };

  const removeAvatar = async () => {
    if (!user?.id) return;
    setRemoving(true);
    try {
      await deleteExistingAvatar();
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', user.id);
      if (error) throw error;
      setAvatarUrl(null);
      trackOnboardingEvent('passport_removed');
      toast({ title: 'Passport picture removed' });
    } catch (err: any) {
      toast({ title: 'Could not remove picture', description: err.message, variant: 'destructive' });
    } finally {
      setRemoving(false);
    }
  };

  const copyUuid = async () => {
    if (!publicUuid) return;
    await navigator.clipboard.writeText(publicUuid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="mb-6" data-testid="user-identity-card">
      <CardContent className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 sm:p-6">
        <div
          className="relative"
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={async (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (!file) return;
            const evt = { target: { files: [file] as unknown as FileList, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
            await handleFile(evt);
          }}
          title="Drag & drop a photo, or click to pick / take one"
        >
          <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-2 border-primary/20 border-dashed">
            {displayUrl && <AvatarImage src={displayUrl} alt={fullName} />}
            <AvatarFallback className="text-xl font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={handlePick}
            disabled={uploading || removing}
            aria-label={avatarUrl ? 'Replace passport picture' : 'Upload passport picture'}
            className="absolute -bottom-1 -right-1 rounded-full bg-primary text-primary-foreground p-2 shadow-md hover:bg-primary/90 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            className="hidden"
            onChange={handleFile}
          />
        </div>
        <div className="flex-1 text-center sm:text-left min-w-0">
          <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
            <h2 className="text-xl font-semibold truncate">{fullName || 'Unnamed User'}</h2>
            {role && <Badge variant="secondary">{role}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1 break-all">{user?.email}</p>
          <div className="mt-2 flex items-center gap-2 justify-center sm:justify-start flex-wrap">
            <span className="text-xs text-muted-foreground">User UUID:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all">
              {publicUuid || '—'}
            </code>
            {publicUuid && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyUuid} aria-label="Copy UUID">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 justify-center sm:justify-start">
            <Button size="sm" variant="outline" onClick={handlePick} disabled={uploading || removing}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              {avatarUrl ? 'Replace photo' : 'Add passport photo'}
            </Button>
            {avatarUrl && (
              <Button
                size="sm"
                variant="ghost"
                onClick={removeAvatar}
                disabled={removing || uploading}
                className="text-destructive hover:text-destructive"
              >
                {removing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                )}
                Remove
              </Button>
            )}
            {!hideSettingsLink && (
              <Button asChild size="sm" variant="ghost">
                <Link to="/settings/profile">
                  <Settings className="h-3.5 w-3.5 mr-1" />
                  Manage profile
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <Dialog open={previewOpen} onOpenChange={(o) => (!o ? closePreview() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm passport picture</DialogTitle>
            <DialogDescription>
              We centered and cropped your photo to a square. It will be visible on
              your dashboard and to admins during verification.
            </DialogDescription>
          </DialogHeader>
          {previewUrl && (
            <div className="flex justify-center py-4">
              <img
                src={previewUrl}
                alt="Passport preview"
                className="h-48 w-48 rounded-lg object-cover border"
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closePreview} disabled={uploading}>
              Choose another
            </Button>
            <Button onClick={confirmUpload} disabled={uploading}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Use this photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default UserIdentityCard;
