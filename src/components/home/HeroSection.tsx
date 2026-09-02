import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle, Phone, Menu, X, LayoutDashboard, LogOut, LogIn, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRegion } from "@/contexts/RegionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserType } from "@/contexts/UserTypeContext";
import { buildWhatsAppLink, buildSmsLink } from "@/lib/contact-links";

import { toast } from "sonner";
import rentmaikarLogo from "@/assets/rentmaikar-logo.jpg";
import heroCarsBg from "@/assets/hero-cars-bg.png";

const WHATSAPP_PREFILL =
  "Hi Rentmaikar, I'd like to learn more about renting or listing a vehicle.";

const HeroSection = () => {
  const { whatsappNumber, smsNumber, supportEmail } = useRegion();
  const { user, userRole, signOut, isLoading } = useAuth();
  const { userType } = useUserType();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const whatsappHref = buildWhatsAppLink(whatsappNumber, WHATSAPP_PREFILL);
  const smsHref = buildSmsLink(smsNumber);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/how-it-works", label: "How it Works" },
    { href: "/catalogue/budget", label: "Budget Cars" },
    { href: "/catalogue/standard", label: "Standard Cars" },
    { href: "/catalogue/premium", label: "Premium Cars" },
    { href: "/faq", label: "FAQ" },
  ];

  const getDashboardLink = () => {
    if (userRole === "admin") return "/admin";
    if (userRole === "owner") return "/owner/dashboard";
    if (userRole === "driver") return "/driver/dashboard";
    return userType === "driver" ? "/driver/dashboard" : "/owner/dashboard";
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/");
  };

  return (
    <section className="relative flex flex-col bg-white">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroCarsBg}
          alt="Rentmaikar cars"
          className="w-full h-full object-contain object-bottom"
        />
      </div>

      {/* ── Top Bar: Logo + Hamburger ── */}
      <div className="relative z-20 flex items-center justify-between px-5 pt-5 pb-2">
        <Link to="/">
          <img
            src={rentmaikarLogo}
            alt="Rentmaikar"
            className="h-14 md:h-16 w-auto object-contain drop-shadow-lg"
          />
        </Link>

        {/* Spacer between logo and menu */}
        <div className="flex-1" aria-hidden="true" />

        <button
          className="p-2 rounded-lg bg-black/10 hover:bg-black/20 transition-colors"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMenuOpen ? (
            <X className="w-7 h-7 text-gray-800" />
          ) : (
            <Menu className="w-7 h-7 text-gray-800" />
          )}
        </button>
      </div>

      {/* ── Slide-down Menu ── */}
      {isMenuOpen && (
        <div className="relative z-20 mx-4 mt-1 rounded-xl bg-white/95 backdrop-blur-md shadow-2xl border border-white/20 animate-slide-up overflow-hidden">
          <nav className="flex flex-col p-4 gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="px-4 py-3 rounded-lg font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t border-border mt-2 pt-3 flex flex-col gap-2">
              {!isLoading && user ? (
                <>
                  <Link to={getDashboardLink()} onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full gap-2">
                      <LayoutDashboard className="w-4 h-4" />
                      My Dashboard
                    </Button>
                  </Link>
                  {userRole === "admin" && (
                    <Link to="/admin" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="ghost" className="w-full gap-2">
                        <Shield className="w-4 h-4" />
                        Admin Portal
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    className="w-full gap-2"
                    onClick={() => { handleSignOut(); setIsMenuOpen(false); }}
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/driver/register" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="heroCTAGreen" className="w-full">
                      Driver Sign Up
                    </Button>
                  </Link>
                  <Link to="/owner/register" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
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

      {/* ── Main Hero Content (kept in upper half so it never overlaps the cars) ── */}
      <div className="relative z-10 flex flex-col items-center px-5 pt-4 pb-4 gap-4 sm:gap-5">

        {/* Accessible page heading — visually hidden so the hero artwork and
            CTA layout are untouched, but screen readers and SEO get a single H1. */}
        <h1 className="sr-only">
          Rentmaikar — rent a rideshare-ready vehicle or list your car to earn
        </h1>

        {/* DRIVERS & OWNERS CTAs */}
        <div className="flex flex-row gap-3 sm:gap-4 justify-center w-full max-w-2xl">
          {/* DRIVERS */}
          <Link to="/driver/register" className="flex-1 max-w-[220px]">
            <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-[hsl(142_72%_38%)] hover:bg-[hsl(142_72%_32%)] active:scale-[0.98] transition-all shadow-xl cursor-pointer py-3 sm:py-4 px-3 text-white">
              <span className="font-black text-2xl sm:text-3xl md:text-4xl uppercase tracking-wide leading-none">
                DRIVERS
              </span>
              <span className="text-xs sm:text-sm font-medium opacity-90">Register here</span>
            </div>
          </Link>

          {/* OWNERS */}
          <Link to="/owner/register" className="flex-1 max-w-[220px]">
            <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-[hsl(217_71%_18%)] hover:bg-[hsl(217_71%_14%)] active:scale-[0.98] transition-all shadow-xl cursor-pointer py-3 sm:py-4 px-3 text-white border border-white/10">
              <span className="font-black text-2xl sm:text-3xl md:text-4xl uppercase tracking-wide leading-none">
                OWNERS
              </span>
              <span className="text-xs sm:text-sm font-medium opacity-90">List your cars here</span>
            </div>
          </Link>
        </div>

        {/* Tagline */}
        <div className="text-center max-w-2xl">
          <p className="text-xs sm:text-sm font-semibold text-gray-900 leading-snug drop-shadow-sm">
            "Your Journey, Our Wheels –{" "}
            <span className="text-black">Rent or List</span> with Confidence on Rentmaikar."
          </p>
        </div>

        {/* Contact Buttons — sourced from admin Regional Contact Channels */}
        <div className="flex flex-row justify-between items-start w-full max-w-3xl gap-2 mt-2 sm:mt-3 mb-1 px-1 sm:px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                  aria-label="Chat with Rentmaikar on WhatsApp — opens WhatsApp with a prefilled message"
                  title="Chat with Rentmaikar on WhatsApp"
                >
                  <Button
                    variant="whatsapp"
                    size="sm"
                    className="w-auto gap-1.5 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs min-h-[36px]"
                  >
                    <MessageCircle className="w-3 h-3" aria-hidden="true" />
                    WhatsApp
                  </Button>
                </a>
              ) : (
                <div className="shrink-0">
                  <Button
                    variant="whatsapp"
                    size="sm"
                    className="w-auto gap-1.5 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs min-h-[36px]"
                    aria-label="WhatsApp not configured for this region"
                    title="WhatsApp not configured for this region yet"
                    onClick={() => toast.info("WhatsApp not configured for this region yet.")}
                  >
                    <MessageCircle className="w-3 h-3" aria-hidden="true" />
                    WhatsApp
                  </Button>
                </div>
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {whatsappHref
                ? "Opens WhatsApp with a message ready to send"
                : "WhatsApp isn't configured for this region yet"}
            </TooltipContent>
          </Tooltip>

          {supportEmail && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={`mailto:${supportEmail}`}
                  className="shrink-0 hidden sm:inline-flex"
                  aria-label={`Email Rentmaikar support at ${supportEmail}`}
                  title={`Email ${supportEmail}`}
                >
                  <Button variant="outline" size="sm" className="w-auto gap-1.5 px-3 py-1.5 text-xs min-h-[36px]">
                    <Phone className="w-3 h-3" aria-hidden="true" />
                    Email us
                  </Button>
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Opens your email app to message support
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              {smsHref ? (
                <a
                  href={smsHref}
                  className="shrink-0"
                  aria-label="Text Rentmaikar — opens your messaging app with our number prefilled"
                  title="Text Rentmaikar"
                >
                  <Button
                    variant="sms"
                    size="sm"
                    className="w-auto gap-1.5 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs min-h-[36px]"
                  >
                    <Phone className="w-3 h-3" aria-hidden="true" />
                    Text us
                  </Button>
                </a>
              ) : (
                <div className="shrink-0">
                  <Button
                    variant="sms"
                    size="sm"
                    className="w-auto gap-1.5 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs min-h-[36px]"
                    aria-label="SMS not configured for this region"
                    title="SMS not configured for this region yet"
                    onClick={() => toast.info("SMS not configured for this region yet.")}
                  >
                    <Phone className="w-3 h-3" aria-hidden="true" />
                    Text us
                  </Button>
                </div>
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {smsHref
                ? "Opens your messaging app with our number prefilled"
                : "SMS isn't configured for this region yet"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>


      {/* Spacer so cars stay visible below the CTAs */}
      <div className="relative z-0 flex-1 min-h-[22vh] md:min-h-[28vh]" aria-hidden="true" />

    </section>
  );
};

export default HeroSection;
