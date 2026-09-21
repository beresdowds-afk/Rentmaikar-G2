import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  X,
  User,
  Building,
  Building2,
  Shield,
  LayoutDashboard,
  LogIn,
  LogOut,
  HelpCircle,
  Globe,
  Car,
  Scale,
  Radio,
  Wrench,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
          {/* Logo & Page History Navigation */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <Link to="/" className="flex-shrink-0">
              <img 
                src={rentmaikarLogo} 
                alt="Rentmaikar" 
                className="h-9 md:h-11 w-auto object-contain"
              />
            </Link>

            <div className="flex items-center gap-0.5 border-l border-border/60 pl-1 sm:pl-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground rounded-full"
                onClick={() => navigate(-1)}
                title="Go to previous page"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground rounded-full"
                onClick={() => navigate(1)}
                title="Go to next page"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

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
                key={`${link.href}-${link.label}`}
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10">
                        <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        Platform Access
                        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Universal Admin Control
                      </DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => navigate('/admin')} className="gap-2 cursor-pointer font-medium">
                        <Shield className="w-4 h-4 text-primary" />
                        Full Admin Control Center
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/driver/dashboard')} className="gap-2 cursor-pointer">
                        <Car className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        Driver Portal & Fleets
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/owner/dashboard')} className="gap-2 cursor-pointer">
                        <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        Vehicle Owner Dashboard
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Operational Support Portals
                      </DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => navigate('/portal/legal')} className="gap-2 cursor-pointer text-xs">
                        <Scale className="w-3.5 h-3.5 text-amber-600" />
                        Legal Compliance Portal
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/portal/iot')} className="gap-2 cursor-pointer text-xs">
                        <Radio className="w-3.5 h-3.5 text-cyan-600" />
                        IoT & Telematics Center
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/portal/vehicle')} className="gap-2 cursor-pointer text-xs">
                        <Wrench className="w-3.5 h-3.5 text-orange-600" />
                        Vehicle Support Portal
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate('/admin-assistant')} className="gap-2 cursor-pointer text-xs text-muted-foreground">
                        <Shield className="w-3.5 h-3.5" />
                        Assistant Dashboard (Role View)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
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
                <Link to="/driver/register">
                  <Button variant="outline" size="sm" className="gap-2">
                    <User className="w-4 h-4" />
                    Driver Sign Up
                  </Button>
                </Link>
                <Link to="/owner/register">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Building className="w-4 h-4" />
                    List Your Car
                  </Button>
                </Link>
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
                  key={`${link.href}-${link.label}`}
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
                      <div className="flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-2">
                        <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider px-2 py-1">
                          Universal Platform Access
                        </div>
                        <Link to="/admin" onClick={() => setIsMenuOpen(false)}>
                          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                            <Shield className="w-3.5 h-3.5 text-primary" />
                            Admin Control Center
                          </Button>
                        </Link>
                        <Link to="/driver/dashboard" onClick={() => setIsMenuOpen(false)}>
                          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                            <Car className="w-3.5 h-3.5 text-emerald-600" />
                            Driver Dashboard & Fleets
                          </Button>
                        </Link>
                        <Link to="/owner/dashboard" onClick={() => setIsMenuOpen(false)}>
                          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                            <Building2 className="w-3.5 h-3.5 text-blue-600" />
                            Vehicle Owner Workspace
                          </Button>
                        </Link>
                        <Link to="/portal/legal" onClick={() => setIsMenuOpen(false)}>
                          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                            <Scale className="w-3.5 h-3.5 text-amber-600" />
                            Legal Compliance Portal
                          </Button>
                        </Link>
                        <Link to="/portal/iot" onClick={() => setIsMenuOpen(false)}>
                          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                            <Radio className="w-3.5 h-3.5 text-cyan-600" />
                            IoT & Telematics Center
                          </Button>
                        </Link>
                        <Link to="/portal/vehicle" onClick={() => setIsMenuOpen(false)}>
                          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                            <Wrench className="w-3.5 h-3.5 text-orange-600" />
                            Vehicle Support Portal
                          </Button>
                        </Link>
                      </div>
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
                    <Link to="/driver/register" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="outline" className="w-full gap-2">
                        <User className="w-4 h-4" />
                        Driver Sign Up
                      </Button>
                    </Link>
                    <Link to="/owner/register" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="outline" className="w-full gap-2">
                        <Building className="w-4 h-4" />
                        List Your Car
                      </Button>
                    </Link>
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
