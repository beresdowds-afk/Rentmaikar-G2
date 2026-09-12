import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  UserCheck,
  Calendar,
  FileText,
  Shield,
  Wrench,
  Car,
  MapPin,
  Clock,
  Users,
  Smartphone,
  ArrowRight,
  CheckCircle2,
  Info,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRegion } from "@/contexts/RegionContext";
import {
  fetchRegionQualification,
  type RegionQualification,
} from "@/services/regionQualificationService";
import { usePlatformSecurityFee } from "@/hooks/usePlatformSecurityFee";

const GetQualifiedSection: React.FC = () => {
  const { country, availableRegions } = useRegion();
  const [qualification, setQualification] = useState<RegionQualification | null>(null);
  const { formatted: securityFeeFormatted, fee: platformSecurityFee } = usePlatformSecurityFee(country || "USA");

  // Automatically fetch qualification for the detected region
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await fetchRegionQualification(country || "USA");
        if (active) {
          setQualification(data);
        }
      } catch (e) {
        console.error("Failed to fetch qualification:", e);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [country]);

  const matchingRegion = availableRegions.find(
    (r) => r.value.toLowerCase() === (country || "").toLowerCase()
  );

  const isNigeria = (country || "").toLowerCase() === "nigeria";
  const isUSA = !isNigeria; // Defaults to USA if not Nigeria or if USA

  const detectedRegionName = matchingRegion?.label || (isNigeria ? "Nigeria" : "United States");
  const detectedFlag = matchingRegion?.flag || (isNigeria ? "🇳🇬" : "🇺🇸");

  // Format platforms string cleanly without trailing 'others'
  const platforms = qualification?.ridesharePlatforms && qualification.ridesharePlatforms.length > 0
    ? qualification.ridesharePlatforms
    : (isNigeria ? ["Bolt", "inDrive"] : ["Uber", "Lyft"]);

  const platformsLabel = platforms.join(" / ");
  const postalLabel = qualification?.postalCodeLabel || (isNigeria ? "Postal code / State" : "Zip code");

  return (
    <section
      id="get-qualified"
      data-tour="get-qualified"
      className="py-16 md:py-24 bg-gradient-to-b from-slate-50 via-white to-slate-50 border-y border-slate-200/80"
      aria-labelledby="get-qualified-heading"
    >
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Section Header - Only displays detected region standards without any switch or search */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
            <ShieldCheck className="w-4 h-4" />
            <span>STANDARDS & VERIFICATION</span>
          </div>
          <h2
            id="get-qualified-heading"
            className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-slate-900 uppercase font-display mb-3"
          >
            GET QUALIFIED
          </h2>
          <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
            Review the vehicle and driver qualification standards required to begin renting or
            listing on Rentmaikar with full insurance compliance.
          </p>

          {/* Clean non-interactive detected region badge */}
          <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm text-xs font-semibold text-slate-700">
            <span className="text-sm">{detectedFlag}</span>
            <span>
              Showing requirements for: <strong className="text-slate-900">{detectedRegionName}</strong>
            </span>
          </div>
        </div>

        {/* 2 Side-by-Side Cards strictly tailored to the detected region */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {/* ============================================================ */}
          {/* CARD 1: OWNERS REQUIREMENT                                   */}
          {/* ============================================================ */}
          <div
            id="card-owners-requirement"
            className="flex flex-col justify-between bg-white rounded-2xl border-2 border-slate-200 shadow-lg hover:shadow-xl hover:border-slate-300 transition-all duration-300 overflow-hidden"
          >
            <div>
              {/* Card Header */}
              <div className="p-6 sm:p-8 bg-gradient-to-br from-[hsl(217_71%_18%)] to-[hsl(217_71%_12%)] text-white">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-white/10 text-white/90 border border-white/15">
                    <Car className="w-3.5 h-3.5 text-blue-300" />
                    For Vehicle Hosts
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-white/15 text-blue-100 flex items-center gap-1.5">
                    <span>{detectedFlag}</span>
                    <span>{detectedRegionName}</span>
                  </span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight uppercase font-display">
                  OWNERS REQUIREMENT
                </h3>
                <p className="text-blue-100/80 text-xs sm:text-sm mt-1.5 leading-relaxed">
                  Every vehicle registered on Rentmaikar in {detectedRegionName} must meet stringent
                  roadworthiness, insurance, and platform mechanical standards.
                </p>
              </div>

              {/* Requirement Items */}
              <div className="p-6 sm:p-8 space-y-4">
                {/* 1. 10 years old and newer */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      10 years old and newer
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      Vehicles must be manufactured within the last 10 model years, clean title, with
                      no structural or flood damage.
                    </p>
                  </div>
                </div>

                {/* 2. Current registration */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      Current registration
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      {isUSA
                        ? "Valid state vehicle registration certificate in the legal owner’s name."
                        : isNigeria
                        ? "Valid state/federal vehicle registration certificate in the legal owner’s name."
                        : `Valid official vehicle registration certificate in ${detectedRegionName} in the legal owner’s name.`}
                    </p>
                  </div>
                </div>

                {/* 3. Insurance documents */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      Insurance documents
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      {isUSA
                        ? "Proof of active commercial rideshare or comprehensive physical damage and liability policy valid in the United States."
                        : isNigeria
                        ? "Proof of active comprehensive commercial insurance policy valid in Nigeria."
                        : `Proof of active commercial rideshare or comprehensive liability policy valid in ${detectedRegionName}.`}
                    </p>
                  </div>
                </div>

                {/* 4. Current certified mechanic 19 point inspection */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      Current certified mechanic 19 point inspection
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      Completed within the last 30 days by an ASE-certified or certified mechanic,
                      verifying brakes, tires, suspension, steering, and critical safety systems.
                    </p>
                  </div>
                </div>

                {/* 5. Rideshare inspections (Strictly region-specific platforms) */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
                  <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm sm:text-base font-bold text-slate-900">
                        Rideshare inspections ({platformsLabel})
                      </h4>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-200/80 text-blue-900 uppercase">
                        {detectedRegionName} Requirement
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      {isUSA
                        ? "Active vehicle inspection paperwork certified by Uber or Lyft inspection stations."
                        : isNigeria
                        ? "Verified vehicle inspection certificate accepted by Bolt or inDrive."
                        : `Official rideshare platform inspection documentation recognized by ${platformsLabel} in ${detectedRegionName}.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Card CTA */}
            <div className="p-6 sm:p-8 pt-0 mt-2">
              <Link to="/owner/register" className="block w-full">
                <Button
                  id="btn-qualify-owner"
                  className="w-full py-5 text-sm sm:text-base font-bold gap-2 bg-[hsl(217_71%_18%)] hover:bg-[hsl(217_71%_14%)] text-white shadow-md hover:shadow-lg transition-all"
                >
                  <span>List Your Car as an Owner</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* ============================================================ */}
          {/* CARD 2: DRIVERS REQUIREMENTS                                 */}
          {/* ============================================================ */}
          <div
            id="card-drivers-requirement"
            className="flex flex-col justify-between bg-white rounded-2xl border-2 border-slate-200 shadow-lg hover:shadow-xl hover:border-slate-300 transition-all duration-300 overflow-hidden"
          >
            <div>
              {/* Card Header */}
              <div className="p-6 sm:p-8 bg-gradient-to-br from-[hsl(142_72%_34%)] to-[hsl(142_72%_24%)] text-white">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-white/10 text-white/90 border border-white/15">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-200" />
                    For Verified Drivers
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-white/15 text-emerald-100 flex items-center gap-1.5">
                    <span>{detectedFlag}</span>
                    <span>{detectedRegionName}</span>
                  </span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight uppercase font-display">
                  DRIVERS REQUIREMENTS
                </h3>
                <p className="text-emerald-50/90 text-xs sm:text-sm mt-1.5 leading-relaxed">
                  Professional drivers in {detectedRegionName} must meet strict identity, background experience,
                  and active rideshare standing before booking any vehicle.
                </p>
              </div>

              {/* Requirement Items */}
              <div className="p-6 sm:p-8 space-y-4">
                {/* 1. Basic informations: Names, Contact Address with Zip/Postal code */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      Basic informations: Names, Contact Address with {postalLabel}
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      {isUSA
                        ? "Full legal name as printed on your state driver’s license, verifiable residential address with accurate Zip code, email, and mobile phone."
                        : isNigeria
                        ? "Full legal name as printed on your national driver’s license, verifiable residential address with state and postal code, email, and mobile phone."
                        : `Full legal name as printed on your government driver’s license, verifiable residential address with ${postalLabel}, email, and mobile phone.`}
                    </p>
                  </div>
                </div>

                {/* 2. Age (25 years and above) */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      Age (25 years and above)
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      Drivers must be at least 25 years old to satisfy commercial fleet insurance
                      underwriting requirements.
                    </p>
                  </div>
                </div>

                {/* 3. Two years driving experience */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      Two years driving experience
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      Minimum of 2 continuous years with a valid, clean driver’s license without major
                      moving violations, DUI/OWI, or active suspensions.
                    </p>
                  </div>
                </div>

                {/* 4. Three Referees */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      Three Referees
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      Provide contact details (Full name, phone, residential address, relationship) for 3
                      credible referees or professional guarantors who can vouch for your integrity.
                    </p>
                  </div>
                </div>

                {/* 5. Rideshare platform registration page (Strictly region-specific) */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm sm:text-base font-bold text-slate-900">
                        Rideshare platform registration page ({platformsLabel})
                      </h4>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-200/80 text-emerald-900 uppercase">
                        Active Profile
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      {isUSA
                        ? "Screenshot or document proving an active, approved driver account with Uber or Lyft."
                        : isNigeria
                        ? "Screenshot or document proving an active, approved driver account with Bolt or inDrive."
                        : `Active driver profile screenshot or approval page from ${platformsLabel} in ${detectedRegionName}.`}
                    </p>
                  </div>
                </div>

                {/* 6. Platform Security Deposit & Fee (Merged Requirement) */}
                <div id="driver-req-platform-security-fee" className="flex items-start gap-3.5 p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-300 shadow-sm">
                  <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
                          Platform Security Deposit & Fee
                        </h4>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-200/80 text-emerald-900 uppercase">
                          Agreement Prerequisite
                        </span>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                        {securityFeeFormatted || (isUSA ? "$500 USD" : "₦250,000 NGN")}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      {platformSecurityFee?.description ||
                        `Mandatory security deposit & fee required from drivers before signing the owner-driver vehicle rental agreement and collecting keys in ${detectedRegionName}.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Card CTA */}
            <div className="p-6 sm:p-8 pt-0 mt-2">
              <Link to="/driver/register" className="block w-full">
                <Button
                  id="btn-qualify-driver"
                  variant="heroCTAGreen"
                  className="w-full py-5 text-sm sm:text-base font-bold gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  <span>Apply to Drive & Get Verified</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Footer Support Banner */}
        <div className="mt-12 p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-semibold text-slate-900">
                Have questions regarding mechanical inspections or referee verification in {detectedRegionName}?
              </p>
              <p className="text-xs text-slate-500">
                Our compliance support team is available to assist you with onboarding.
              </p>
            </div>
          </div>
          <Link to="/faq" className="shrink-0">
            <Button variant="outline" size="sm" className="text-xs font-semibold">
              Read Verification FAQ
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default GetQualifiedSection;
