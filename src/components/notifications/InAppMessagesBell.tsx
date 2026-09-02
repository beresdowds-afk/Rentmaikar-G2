import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useInAppMessages } from '@/hooks/useInAppMessages';

/** Header bell linking to the in-app inbox with an unread badge. */
export function InAppMessagesBell({ className }: { className?: string }) {
  const { unreadCount } = useInAppMessages(50);

  return (
    <Button asChild variant="ghost" size="icon" className={className} aria-label="Messages">
      <Link to="/messages" className="relative">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Link>
    </Button>
  );
}

export default InAppMessagesBell;
