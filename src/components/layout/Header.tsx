import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, User, Building, Shield, LayoutDashboard, LogIn, LogOut, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import RegionSwitcher from "@/components/home/RegionSwitcher";
import { InAppMessagesBell } from "@/components/notifications/InAppMessagesBell";
import { useUserType } from "@/contexts/UserTypeContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import rentmaikarLogo from "@/assets/rentmaikar-logo.jpg";
import rentmaikarBanner from "@/assets/rentmaikar-banner.jpg";

interface HeaderProps {
  onRestartTour?: () => void;
}

const Header = ({ onRestartTour }: HeaderProps = {}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { userType } = useUserType();
  const { user, userRole, signOut, isLoading } = useAuth();

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/catalogue/standard", label: "Catalog" },
    { href: "/catalogue/budget", label: "Budget Cars" },
    { href: "/catalogue/standard", label: "Standard Cars" },
    { href: "/catalogue/premium", label: "Premium Cars" },
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/");
  };

  const getDashboardLink = () => {
    if (userRole === 'admin') return '/admin';
    if (userRole === 'admin_assistant') return '/admin-assistant';
    if (userRole === 'owner') return '/owner/dashboard';
    if (userRole === 'driver') return '/driver/dashboard';
    if (userRole === 'legal_support') return '/support/legal';
    if (userRole === 'iot_support') return '/support/iot';
    if (userRole === 'vehicle_support') return '/support/vehicle';
    if (userRole === 'insurance_support') return '/support/insurance';
    // Fallback based on userType context
    return userType === 'driver' ? '/driver/dashboard' : '/owner/dashboard';
  };


  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-effect" role="banner">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <img 
              src={rentmaikarLogo} 
              alt="Rentmaikar" 
              className="h-9 md:h-11 w-auto object-contain"
            />
          </Link>

          {/* Banner - Between Logo and Menu Button (mobile/tablet only) */}
          <div className="flex-1 flex justify-center px-3 lg:hidden min-w-0">
            <img 
              src={rentmaikarBanner} 
              alt="Rent Mai Kar" 
              className="h-9 md:h-12 w-auto max-w-[200px] md:max-w-[260px] object-contain"
            />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Main navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium transition-colors",
                  isActive(link.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-3">
            {onRestartTour && location.pathname === "/" && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onRestartTour}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <HelpCircle className="w-4 h-4" />
                Tour
              </Button>
            )}
            {(userRole === 'admin' || userRole === 'admin_assistant') && (
              <div data-tour="region">
                <RegionSwitcher />
              </div>
            )}

            
            {!isLoading && user ? (
              <>
                <InAppMessagesBell />
                <Link to={getDashboardLink()}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <LayoutDashboard className="w-4 h-4" />
                    My Dashboard
                  </Button>
                </Link>
                {userRole === 'admin' && (
                  <Link to="/admin">
                    <Button variant="ghost" size="icon" title="Admin Portal">
                      <Shield className="w-5 h-5" />
                    </Button>
                  </Link>
                )}
                {userRole === 'admin_assistant' && (
                  <Link to="/admin-assistant">
                    <Button variant="ghost" size="icon" title="Admin Assistant Portal">
                      <Shield className="w-5 h-5" />
                    </Button>
                  </Link>
                )}
                <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                {userType === 'driver' ? (
                  <Link to="/driver/register">
                    <Button variant="outline" size="sm" className="gap-2">
                      <User className="w-4 h-4" />
                      Driver Sign Up
                    </Button>
                  </Link>
                ) : (
                  <Link to="/owner/register">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Building className="w-4 h-4" />
                      List Your Car
                    </Button>
                  </Link>
                )}
                <Link to="/auth">
                  <Button variant="default" size="sm" className="gap-2">
                    <LogIn className="w-4 h-4" />
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden flex-shrink-0 p-2 rounded-lg hover:bg-muted"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="lg:hidden py-4 border-t border-border animate-slide-up">
            <nav className="flex flex-col gap-2">
              {/* Region Switcher and Tour for Mobile */}
              {(userRole === 'admin' || userRole === 'admin_assistant') ? (
                <div className="px-4 py-2 flex items-center justify-between border-b border-border mb-2 pb-4">
                  <span className="text-sm text-muted-foreground">Region</span>
                  <div className="flex items-center gap-2">
                    {onRestartTour && location.pathname === "/" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { onRestartTour(); setIsMenuOpen(false); }}
                        className="gap-1"
                      >
                        <HelpCircle className="w-4 h-4" />
                        Tour
                      </Button>
                    )}
                    <RegionSwitcher />
                  </div>
                </div>
              ) : onRestartTour && location.pathname === "/" ? (
                <div className="px-4 py-2 flex items-center justify-end border-b border-border mb-2 pb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { onRestartTour(); setIsMenuOpen(false); }}
                    className="gap-1"
                  >
                    <HelpCircle className="w-4 h-4" />
                    Tour
                  </Button>
                </div>
              ) : null}

              
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={cn(
                    "px-4 py-3 rounded-lg font-medium transition-colors",
                    isActive(link.href)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {link.label}
                </Link>
              ))}
              
              <div className="flex flex-col gap-2 pt-4 border-t border-border mt-2">
                {!isLoading && user ? (
                  <>
                    <Link to={getDashboardLink()} onClick={() => setIsMenuOpen(false)}>
                      <Button variant="outline" className="w-full gap-2">
                        <LayoutDashboard className="w-4 h-4" />
                        My Dashboard
                      </Button>
                    </Link>
                    {userRole === 'admin' && (
                      <Link to="/admin" onClick={() => setIsMenuOpen(false)}>
                        <Button variant="ghost" className="w-full gap-2">
                          <Shield className="w-4 h-4" />
                          Admin Portal
                        </Button>
                      </Link>
                    )}
                    {userRole === 'admin_assistant' && (
                      <Link to="/admin-assistant" onClick={() => setIsMenuOpen(false)}>
                        <Button variant="ghost" className="w-full gap-2">
                          <Shield className="w-4 h-4" />
                          Admin Assistant Portal
                        </Button>
                      </Link>
                    )}
                    <Button variant="ghost" className="w-full gap-2" onClick={() => { handleSignOut(); setIsMenuOpen(false); }}>
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    {userType === 'driver' ? (
                      <Link to="/driver/register" onClick={() => setIsMenuOpen(false)}>
                        <Button variant="outline" className="w-full gap-2">
                          <User className="w-4 h-4" />
                          Driver Sign Up
                        </Button>
                      </Link>
                    ) : (
                      <Link to="/owner/register" onClick={() => setIsMenuOpen(false)}>
                        <Button variant="outline" className="w-full gap-2">
                          <Building className="w-4 h-4" />
                          List Your Car
                        </Button>
                      </Link>
                    )}
                    <Link to="/auth" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="default" className="w-full gap-2">
                        <LogIn className="w-4 h-4" />
                        Sign In
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
