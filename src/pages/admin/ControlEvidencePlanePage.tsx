import React from "react";
import Seo from "@/components/seo/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ControlEvidencePlane } from "@/components/admin/control-plane/ControlEvidencePlane";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield } from "lucide-react";

export const ControlEvidencePlanePage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Seo
        title="Control & Evidence Plane | RentMaikar Admin"
        description="Authoritative, tamper-evident governance substrate separate from operational application workflows. Event ledger, decision log, audit trail, evidence store, disputes, appeals, compliance, and reporting."
      />
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Link to="/admin">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <ArrowLeft className="h-4 w-4" />
                Return to Dashboard
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin?portal=control-plane">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Shield className="h-3.5 w-3.5 text-primary" />
                Open Inside Dashboard
              </Button>
            </Link>
          </div>
        </div>

        <ControlEvidencePlane scope="admin" />
      </main>
      <Footer />
    </div>
  );
};

export default ControlEvidencePlanePage;
